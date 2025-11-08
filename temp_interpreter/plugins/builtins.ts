// Built-in plugins for Flick

import { Plugin, PluginContext } from '../plugin.js';
import * as AST from '../ast.js';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';

// Helper function to parse request body
async function parseRequestBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        // Try to parse as JSON if content-type is application/json
        const contentType = req.headers['content-type'] || '';
        if (contentType.includes('application/json') && body) {
          resolve(JSON.parse(body));
        } else {
          // Return raw body as string
          resolve(body);
        }
      } catch (error) {
        resolve(body); // If JSON parsing fails, return raw body
      }
    });
    req.on('error', reject);
  });
}

// Web Plugin (Gazelle)
export const WebPlugin: Plugin = {
  name: 'web',

  onDeclare(args: any) {
    const port = args?.value || 3000;
    const isModule = typeof args?.value === 'string' && args.value === 'module';
    if (isModule) {
      console.log(`[Gazelle] Web module declared (no server will start)`);
    } else {
      console.log(`[Gazelle] Web plugin declared on port ${port}`);
    }
  },

  registerBuiltins(env: any, args: any) {
    // Can add helper functions here if needed
  },

  async execute(node: AST.ASTNode, interpreter: any, env: any): Promise<any> {
    if (node.type === 'RouteStatement') {
      // Routes are collected and handled in onFileComplete
      return null;
    }

    if (node.type === 'RespondStatement') {
      // This is called within a route handler context
      let content: string;
      let statusCode = 200;
      let contentType = 'text/plain';

      if (node.options?.json) {
        const jsonData = await interpreter.evaluateExpression(node.options.json, env);
        content = JSON.stringify(jsonData);
        contentType = 'application/json';
      } else {
        content = await interpreter.evaluateExpression(node.content, env);
        content = interpreter.stringify(content);
      }

      if (node.options?.status) {
        statusCode = await interpreter.evaluateExpression(node.options.status, env);
      }

      return { __respond: true, content, statusCode, contentType };
    }

    return null;
  },

  async onFileComplete(context: PluginContext) {
    const webDeclaration = context.declaredPlugins.get('web');
    const isModule = typeof webDeclaration?.value === 'string' && webDeclaration.value === 'module';

    // Don't start server for modules
    if (isModule) {
      return;
    }

    const port = webDeclaration?.value || 3000;
    const routes = new Map<string, any>(); // key: "METHOD:path"

    // Collect all routes from the AST
    const collectRoutes = (node: any, prefix: string = ''): void => {
      if (!node) return;

      if (node.type === 'RouteStatement') {
        const method = node.method || 'GET';
        const fullPath = prefix + node.path;
        const key = `${method}:${fullPath}`;

        if (node.forward) {
          // This is a forwarding route
          routes.set(key, { ...node, fullPath, method, isForwarding: true });
        } else {
          routes.set(key, { ...node, fullPath, method });
        }
      }

      if (node.body && Array.isArray(node.body)) {
        node.body.forEach((child: any) => collectRoutes(child, prefix));
      }
      if (node.type === 'Program' && node.body) {
        node.body.forEach((child: any) => collectRoutes(child, prefix));
      }
    };

    // Get program AST from context
    if (context.env?.__program) {
      collectRoutes(context.env.__program);
    }

    if (routes.size === 0) {
      console.log('[Gazelle] No routes defined, skipping server start');
      return;
    }

    console.log(`[Gazelle] Starting server on port ${port}...`);
    console.log(`[Gazelle] Registered routes:`);
    for (const [key, route] of routes) {
      const method = route.isForwarding ? 'ALL' : (route.method || 'GET');
      console.log(`  - ${method} ${route.fullPath}${route.forward ? ` -> ${route.forward}` : ''}`);
    }

    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = req.url || '/';
      const method = req.method || 'GET';
      const key = `${method}:${url}`;

      // Try to find exact match first
      let route = routes.get(key);

      // If not found, try GET as default for exact matches
      if (!route && method === 'GET') {
        route = routes.get(`GET:${url}`);
      }

      // If still not found, check for forwarding routes (any method can match a forwarding route)
      if (!route) {
        for (const [routeKey, routeData] of routes) {
          if (routeData.isForwarding) {
            const [, routePath] = routeKey.split(':');
            // Check if URL starts with the forward path
            if (url.startsWith(routePath)) {
              route = routeData;
              break;
            }
          }
        }
      }

      if (!route) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }

      try {
        // Parse request body
        const requestBody = await parseRequestBody(req);

        // Parse query parameters using modern URL API
        const fullUrl = `http://${req.headers.host || 'localhost'}${req.url || ''}`;
        const parsedUrl = new URL(fullUrl);
        const queryParams: Record<string, any> = {};
        parsedUrl.searchParams.forEach((value, key) => {
          queryParams[key] = value;
        });

        // Get headers
        const headers = req.headers;

        if (route.isForwarding && route.forward) {
          // Handle forwarding - look up the module in environment
          const forwardTarget = context.env.vars.get(route.forward);
          if (!forwardTarget) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end(`Forward target not found: ${route.forward}`);
            return;
          }

          const forwardedRoutes = forwardTarget.value.__routes || [];

          // Calculate the remaining path after the forward prefix
          const remainingPath = url.substring(route.fullPath.length) || '/';

          // Find matching route in forwarded module (match by METHOD and path)
          let matchedRoute = null;
          for (const fRoute of forwardedRoutes) {
            const fMethod = fRoute.method || 'GET';
            if (fMethod === method && fRoute.path === remainingPath) {
              matchedRoute = fRoute;
              break;
            }
          }

          if (!matchedRoute) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end(`Not Found in forwarded routes (looking for ${method} ${remainingPath})`);
            return;
          }

          // Create a route-scoped environment with request data
          const routeEnv = {
            vars: new Map([
              ['req', { value: { method, url, headers, body: requestBody }, mutable: false }],
              ['body', { value: requestBody, mutable: false }],
              ['query', { value: queryParams, mutable: false }],
              ['headers', { value: headers, mutable: false }],
            ]),
            parent: forwardTarget.value.__env
          };

          // Execute forwarded route
          const interpreter = context.env.__interpreter;
          let responseContent = '';
          let statusCode = 200;
          let contentType = 'text/plain';

          for (const statement of matchedRoute.body || []) {
            const result = await interpreter.evaluateStatement(statement, routeEnv);
            if (result && result.__respond) {
              responseContent = result.content;
              statusCode = result.statusCode || 200;
              contentType = result.contentType || 'text/plain';
            }
          }

          res.writeHead(statusCode, { 'Content-Type': contentType });
          res.end(responseContent || 'OK');
          return;
        }

        if (route.body) {
          // Create a route-scoped environment with request data
          const routeEnv = {
            vars: new Map([
              ['req', { value: { method, url, headers, body: requestBody }, mutable: false }],
              ['body', { value: requestBody, mutable: false }],
              ['query', { value: queryParams, mutable: false }],
              ['headers', { value: headers, mutable: false }],
            ]),
            parent: context.env
          };

          // Execute route handler
          const interpreter = context.env.__interpreter;
          let responseContent = '';
          let statusCode = 200;
          let contentType = 'text/plain';

          for (const statement of route.body) {
            const result = await interpreter.evaluateStatement(statement, routeEnv);
            if (result && result.__respond) {
              responseContent = result.content;
              statusCode = result.statusCode || 200;
              contentType = result.contentType || 'text/plain';
            }
          }

          res.writeHead(statusCode, { 'Content-Type': contentType });
          res.end(responseContent || 'OK');
        }
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Error: ${error instanceof Error ? error.message : error}`);
      }
    });

    server.listen(port);
    console.log(`[Gazelle] Server running at http://localhost:${port}/`);
    console.log('[Gazelle] Press Ctrl+C to stop');
  }
};

// Files Plugin
export const FilesPlugin: Plugin = {
  name: 'files',

  registerBuiltins(env: any, args: any) {
    // read function
    env.vars.set('read', {
      value: (path: string) => {
        try {
          return readFileSync(path, 'utf-8');
        } catch (error) {
          throw new Error(`Failed to read file: ${path}`);
        }
      },
      mutable: false
    });

    // write function
    env.vars.set('write', {
      value: (path: string, content: string) => {
        try {
          writeFileSync(path, content, 'utf-8');
          return true;
        } catch (error) {
          throw new Error(`Failed to write file: ${path}`);
        }
      },
      mutable: false
    });

    // exists function
    env.vars.set('exists', {
      value: (path: string) => {
        return existsSync(path);
      },
      mutable: false
    });

    // listdir function
    env.vars.set('listdir', {
      value: (path: string) => {
        try {
          return readdirSync(path);
        } catch (error) {
          throw new Error(`Failed to list directory: ${path}`);
        }
      },
      mutable: false
    });
  }
};

// Time Plugin
export const TimePlugin: Plugin = {
  name: 'time',

  registerBuiltins(env: any, args: any) {
    // now - current timestamp
    env.vars.set('now', {
      value: () => Date.now(),
      mutable: false
    });

    // sleep function (returns a promise)
    env.vars.set('sleep', {
      value: (ms: number) => {
        return new Promise(resolve => setTimeout(resolve, ms));
      },
      mutable: false
    });

    // timestamp function
    env.vars.set('timestamp', {
      value: () => new Date().toISOString(),
      mutable: false
    });
  }
};

// Random Plugin
export const RandomPlugin: Plugin = {
  name: 'random',

  registerBuiltins(env: any, args: any) {
    // random number between 0 and 1
    env.vars.set('random', {
      value: () => Math.random(),
      mutable: false
    });

    // randint - random integer in range
    env.vars.set('randint', {
      value: (min: number, max: number) => {
        return Math.floor(Math.random() * (max - min + 1)) + min;
      },
      mutable: false
    });

    // shuffle array
    env.vars.set('shuffle', {
      value: (arr: any[]) => {
        const shuffled = [...arr];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
      },
      mutable: false
    });

    // choice - pick random element from array
    env.vars.set('choice', {
      value: (arr: any[]) => {
        if (arr.length === 0) return null;
        return arr[Math.floor(Math.random() * arr.length)];
      },
      mutable: false
    });
  }
};

