// AST Node definitions for Flick language

export type ASTNode =
  | ProgramNode
  | GroupDeclarationNode
  | BlueprintDeclarationNode
  | TaskDeclarationNode
  | DoImplementationNode
  | VariableDeclarationNode
  | AssignmentNode
  | PrintStatementNode
  | IfStatementNode
  | EachLoopNode
  | MarchLoopNode
  | SelectStatementNode
  | ExpressionStatementNode
  | BinaryExpressionNode
  | UnaryExpressionNode
  | CallExpressionNode
  | MemberExpressionNode
  | LiteralNode
  | IdentifierNode
  | ArrayLiteralNode
  | ObjectLiteralNode
  | AskExpressionNode
  | DeclareStatementNode
  | RouteStatementNode
  | RespondStatementNode
  | PluginStatementNode
  | UseStatementNode
  | ImportStatementNode
  | ReturnStatementNode
  | TernaryExpressionNode;

export interface ProgramNode {
  type: 'Program';
  body: ASTNode[];
}

export interface GroupDeclarationNode {
  type: 'GroupDeclaration';
  name: string;
  fields: VariableDeclarationNode[];
  methods: TaskDeclarationNode[];
}

export interface BlueprintDeclarationNode {
  type: 'BlueprintDeclaration';
  name: string;
  methods: TaskSignatureNode[];
}

export interface TaskSignatureNode {
  name: string;
  parameters: ParameterNode[];
}

export interface TaskDeclarationNode {
  type: 'TaskDeclaration';
  name: string;
  parameters: ParameterNode[];
  body: ASTNode[];
}

export interface ParameterNode {
  name: string;
  paramType: string; // 'num', 'literal', etc.
}

export interface DoImplementationNode {
  type: 'DoImplementation';
  blueprintName: string;
  groupName: string;
  methods: TaskDeclarationNode[];
}

export interface VariableDeclarationNode {
  type: 'VariableDeclaration';
  name: string;
  mutable: boolean; // true for 'free', false for 'lock'
  varType?: string; // 'num', 'literal', type name, etc.
  initializer?: ASTNode;
}

export interface AssignmentNode {
  type: 'Assignment';
  target: ASTNode; // identifier or member expression
  value: ASTNode;
}

export interface PrintStatementNode {
  type: 'PrintStatement';
  expressions: ASTNode[];
}

export interface IfStatementNode {
  type: 'IfStatement';
  conditions: Array<{ condition: ASTNode | null; body: ASTNode[] }>;
}

export interface EachLoopNode {
  type: 'EachLoop';
  variable: string;
  iterable: ASTNode;
  body: ASTNode[];
}

export interface MarchLoopNode {
  type: 'MarchLoop';
  variable: string;
  start: ASTNode;
  end: ASTNode;
  body: ASTNode[];
}

export interface SelectStatementNode {
  type: 'SelectStatement';
  expression: ASTNode;
  cases: Array<{ key: string; conditions: ASTNode[]; body: ASTNode[] }>;
}

export interface ExpressionStatementNode {
  type: 'ExpressionStatement';
  expression: ASTNode;
}

export interface BinaryExpressionNode {
  type: 'BinaryExpression';
  operator: string;
  left: ASTNode;
  right: ASTNode;
}

export interface UnaryExpressionNode {
  type: 'UnaryExpression';
  operator: string;
  operand: ASTNode;
}

export interface CallExpressionNode {
  type: 'CallExpression';
  callee: ASTNode;
  args: ASTNode[];
}

export interface MemberExpressionNode {
  type: 'MemberExpression';
  object: ASTNode;
  property: ASTNode;
  computed: boolean; // true for obj[prop], false for obj.prop
}

export interface LiteralNode {
  type: 'Literal';
  value: any;
  raw: string;
}

export interface IdentifierNode {
  type: 'Identifier';
  name: string;
}

export interface ArrayLiteralNode {
  type: 'ArrayLiteral';
  elements: ASTNode[];
}

export interface ObjectLiteralNode {
  type: 'ObjectLiteral';
  properties: Array<{ key: string; value: ASTNode }>;
}

export interface AskExpressionNode {
  type: 'AskExpression';
  prompt: ASTNode;
}

export interface DeclareStatementNode {
  type: 'DeclareStatement';
  plugin: string;
  argument?: ASTNode;
}

export interface RouteStatementNode {
  type: 'RouteStatement';
  method?: string; // GET, POST, PUT, DELETE, PATCH
  path: string;
  body?: ASTNode[];
  forward?: string; // identifier to forward to
}

export interface RespondStatementNode {
  type: 'RespondStatement';
  content: ASTNode;
  options?: {
    json?: ASTNode;
    status?: ASTNode;
  };
}

export interface PluginStatementNode {
  type: 'PluginStatement';
  pluginName: string;
  data: any;
}

export interface UseStatementNode {
  type: 'UseStatement';
  name: string;
  path?: string;
}

export interface ImportStatementNode {
  type: 'ImportStatement';
  names: string[]; // Named imports or ['*'] for default/namespace
  from: string; // Module path (npm package or file path)
  alias?: string; // For 'import * as alias'
  isDefaultImport?: boolean; // True for default import, false for named
}

export interface ReturnStatementNode {
  type: 'ReturnStatement';
  value?: ASTNode; // Optional return value
}

export interface TernaryExpressionNode {
  type: 'TernaryExpression';
  condition: ASTNode;
  consequent: ASTNode;
  alternate?: ASTNode;
}
