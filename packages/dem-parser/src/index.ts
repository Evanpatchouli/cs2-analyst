export interface DemoParser {
  parse(filePath: string): Promise<unknown>;
}
