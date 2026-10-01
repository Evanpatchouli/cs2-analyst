export interface ParserAdapter {
  name: string;
  parse(filePath: string): Promise<unknown>;
}
