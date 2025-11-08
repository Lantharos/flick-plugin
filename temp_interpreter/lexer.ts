// Lexer for Flick language

export enum TokenType {
  // Keywords
  GROUP = 'GROUP',
  BLUEPRINT = 'BLUEPRINT',
  TASK = 'TASK',
  FREE = 'FREE',
  LOCK = 'LOCK',
  ASSUME = 'ASSUME',
  MAYBE = 'MAYBE',
  OTHERWISE = 'OTHERWISE',
  EACH = 'EACH',
  MARCH = 'MARCH',
  SUPPOSE = 'SUPPOSE',
  OOPSIE = 'OOPSIE',
  ATTEMPT = 'ATTEMPT',
  DO = 'DO',
  FOR = 'FOR',
  WITH = 'WITH',
  IN = 'IN',
  FROM = 'FROM',
  TO = 'TO',
  WHEN = 'WHEN',
  SELECT = 'SELECT',
  END = 'END',
  PRINT = 'PRINT',
  ASK = 'ASK',
  AND = 'AND',
  YES = 'YES',
  NO = 'NO',
  NUM = 'NUM',
  LITERAL = 'LITERAL',
  DECLARE = 'DECLARE',
  USE = 'USE',
  IMPORT = 'IMPORT',
  GIVE = 'GIVE',

  // Plugin-specific keywords (dynamically registered)
  ROUTE = 'ROUTE',
  RESPOND = 'RESPOND',

  // HTTP methods
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  PATCH = 'PATCH',

  // Literals
  STRING = 'STRING',
  NUMBER = 'NUMBER',
  BOOLEAN = 'BOOLEAN',
  IDENTIFIER = 'IDENTIFIER',

  // Operators
  ASSIGN = 'ASSIGN',       // :=
  EQUALS = 'EQUALS',       // ==
  NOT_EQUALS = 'NOT_EQUALS', // !=
  LESS_THAN = 'LESS_THAN', // <
  GREATER_THAN = 'GREATER_THAN', // >
  LESS_EQUAL = 'LESS_EQUAL', // <=
  GREATER_EQUAL = 'GREATER_EQUAL', // >=
  PLUS = 'PLUS',           // +
  MINUS = 'MINUS',         // -
  MULTIPLY = 'MULTIPLY',   // *
  DIVIDE = 'DIVIDE',       // /
  DOT = 'DOT',             // .

  // Delimiters
  LPAREN = 'LPAREN',       // (
  RPAREN = 'RPAREN',       // )
  LBRACE = 'LBRACE',       // {
  RBRACE = 'RBRACE',       // }
  LBRACKET = 'LBRACKET',   // [
  RBRACKET = 'RBRACKET',   // ]
  COMMA = 'COMMA',         // ,
  COLON = 'COLON',         // :
  ARROW = 'ARROW',         // =>
  AT = 'AT',               // @

  // Special
  NEWLINE = 'NEWLINE',
  EOF = 'EOF',
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

const KEYWORDS: Record<string, TokenType> = {
  'group': TokenType.GROUP,
  'blueprint': TokenType.BLUEPRINT,
  'task': TokenType.TASK,
  'free': TokenType.FREE,
  'lock': TokenType.LOCK,
  'assume': TokenType.ASSUME,
  'maybe': TokenType.MAYBE,
  'otherwise': TokenType.OTHERWISE,
  'each': TokenType.EACH,
  'march': TokenType.MARCH,
  'suppose': TokenType.SUPPOSE,
  'oopsie': TokenType.OOPSIE,
  'attempt': TokenType.ATTEMPT,
  'do': TokenType.DO,
  'for': TokenType.FOR,
  'with': TokenType.WITH,
  'in': TokenType.IN,
  'from': TokenType.FROM,
  'to': TokenType.TO,
  'when': TokenType.WHEN,
  'select': TokenType.SELECT,
  'end': TokenType.END,
  'print': TokenType.PRINT,
  'ask': TokenType.ASK,
  'and': TokenType.AND,
  'yes': TokenType.YES,
  'no': TokenType.NO,
  'num': TokenType.NUM,
  'literal': TokenType.LITERAL,
  'declare': TokenType.DECLARE,
  'use': TokenType.USE,
  'import': TokenType.IMPORT,
  'give': TokenType.GIVE,
  'route': TokenType.ROUTE,
  'respond': TokenType.RESPOND,
  'GET': TokenType.GET,
  'POST': TokenType.POST,
  'PUT': TokenType.PUT,
  'DELETE': TokenType.DELETE,
  'PATCH': TokenType.PATCH,
};

export class Lexer {
  private input: string;
  private position: number = 0;
  private line: number = 1;
  private column: number = 1;

  constructor(input: string) {
    this.input = input;
  }

  private peek(offset: number = 0): string {
    const pos = this.position + offset;
    return pos < this.input.length ? this.input[pos] : '';
  }

  private advance(): string {
    const char = this.peek();
    this.position++;
    if (char === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return char;
  }

  private skipWhitespace(): void {
    while (this.peek() && /[ \t\r]/.test(this.peek())) {
      this.advance();
    }
  }

  private skipComment(): void {
    if (this.peek() === '#') {
      while (this.peek() && this.peek() !== '\n') {
        this.advance();
      }
    }
  }

  private readString(): string {
    const quote = this.advance(); // consume opening quote
    let result = '';

    while (this.peek() && this.peek() !== quote) {
      if (this.peek() === '\\') {
        this.advance();
        const next = this.advance();
        switch (next) {
          case 'n': result += '\n'; break;
          case 't': result += '\t'; break;
          case 'r': result += '\r'; break;
          case '\\': result += '\\'; break;
          case '"': result += '"'; break;
          case "'": result += "'"; break;
          default: result += next;
        }
      } else {
        result += this.advance();
      }
    }

    if (this.peek() === quote) {
      this.advance(); // consume closing quote
    }

    return result;
  }

  private readNumber(): string {
    let result = '';

    while (this.peek() && /[0-9.]/.test(this.peek())) {
      result += this.advance();
    }

    return result;
  }

  private readIdentifier(): string {
    let result = '';

    while (this.peek() && /[a-zA-Z0-9_]/.test(this.peek())) {
      result += this.advance();
    }

    return result;
  }

  public tokenize(): Token[] {
    const tokens: Token[] = [];

    while (this.position < this.input.length) {
      this.skipWhitespace();

      if (!this.peek()) break;

      // Skip comments
      if (this.peek() === '#') {
        this.skipComment();
        continue;
      }

      const line = this.line;
      const column = this.column;

      // Newlines
      if (this.peek() === '\n') {
        this.advance();
        tokens.push({ type: TokenType.NEWLINE, value: '\n', line, column });
        continue;
      }

      // Strings
      if (this.peek() === '"' || this.peek() === "'") {
        const value = this.readString();
        tokens.push({ type: TokenType.STRING, value, line, column });
        continue;
      }

      // Numbers
      if (/[0-9]/.test(this.peek())) {
        const value = this.readNumber();
        tokens.push({ type: TokenType.NUMBER, value, line, column });
        continue;
      }

      // Two-character operators
      if (this.peek() === ':' && this.peek(1) === '=') {
        this.advance();
        this.advance();
        tokens.push({ type: TokenType.ASSIGN, value: ':=', line, column });
        continue;
      }

      if (this.peek() === '=' && this.peek(1) === '=') {
        this.advance();
        this.advance();
        tokens.push({ type: TokenType.EQUALS, value: '==', line, column });
        continue;
      }

      if (this.peek() === '=' && this.peek(1) === '>') {
        this.advance();
        this.advance();
        tokens.push({ type: TokenType.ARROW, value: '=>', line, column });
        continue;
      }

      if (this.peek() === '!' && this.peek(1) === '=') {
        this.advance();
        this.advance();
        tokens.push({ type: TokenType.NOT_EQUALS, value: '!=', line, column });
        continue;
      }

      if (this.peek() === '<' && this.peek(1) === '=') {
        this.advance();
        this.advance();
        tokens.push({ type: TokenType.LESS_EQUAL, value: '<=', line, column });
        continue;
      }

      if (this.peek() === '>' && this.peek(1) === '=') {
        this.advance();
        this.advance();
        tokens.push({ type: TokenType.GREATER_EQUAL, value: '>=', line, column });
        continue;
      }

      // Single-character operators and delimiters
      const char = this.peek();
      switch (char) {
        case '(':
          this.advance();
          tokens.push({ type: TokenType.LPAREN, value: '(', line, column });
          continue;
        case ')':
          this.advance();
          tokens.push({ type: TokenType.RPAREN, value: ')', line, column });
          continue;
        case '{':
          this.advance();
          tokens.push({ type: TokenType.LBRACE, value: '{', line, column });
          continue;
        case '}':
          this.advance();
          tokens.push({ type: TokenType.RBRACE, value: '}', line, column });
          continue;
        case '[':
          this.advance();
          tokens.push({ type: TokenType.LBRACKET, value: '[', line, column });
          continue;
        case ']':
          this.advance();
          tokens.push({ type: TokenType.RBRACKET, value: ']', line, column });
          continue;
        case ',':
          this.advance();
          tokens.push({ type: TokenType.COMMA, value: ',', line, column });
          continue;
        case ':':
          this.advance();
          tokens.push({ type: TokenType.COLON, value: ':', line, column });
          continue;
        case '.':
          this.advance();
          tokens.push({ type: TokenType.DOT, value: '.', line, column });
          continue;
        case '+':
          this.advance();
          tokens.push({ type: TokenType.PLUS, value: '+', line, column });
          continue;
        case '-':
          this.advance();
          tokens.push({ type: TokenType.MINUS, value: '-', line, column });
          continue;
        case '*':
          this.advance();
          tokens.push({ type: TokenType.MULTIPLY, value: '*', line, column });
          continue;
        case '/':
          this.advance();
          tokens.push({ type: TokenType.DIVIDE, value: '/', line, column });
          continue;
        case '<':
          this.advance();
          tokens.push({ type: TokenType.LESS_THAN, value: '<', line, column });
          continue;
        case '>':
          this.advance();
          tokens.push({ type: TokenType.GREATER_THAN, value: '>', line, column });
          continue;
        case '@':
          this.advance();
          tokens.push({ type: TokenType.AT, value: '@', line, column });
          continue;
        case '=':
          // Single = (for initialization in declarations)
          this.advance();
          tokens.push({ type: TokenType.ASSIGN, value: '=', line, column });
          continue;
      }

      // Identifiers and keywords
      if (/[a-zA-Z_]/.test(this.peek())) {
        const identifier = this.readIdentifier();
        const tokenType = KEYWORDS[identifier] || TokenType.IDENTIFIER;
        tokens.push({ type: tokenType, value: identifier, line, column });
        continue;
      }

      // Unknown character
      throw new Error(`Unexpected character '${this.peek()}' at line ${line}, column ${column}`);
    }

    tokens.push({ type: TokenType.EOF, value: '', line: this.line, column: this.column });
    return tokens;
  }
}

