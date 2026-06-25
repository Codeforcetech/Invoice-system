/**
 * メール・帳票テンプレの変数差し込み（{{snake_case}}）
 */
export function applyTemplateVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
}
