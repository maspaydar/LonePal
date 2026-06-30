export function getStoredCompanyToken(): string {
  return localStorage.getItem("co_token") || "";
}
