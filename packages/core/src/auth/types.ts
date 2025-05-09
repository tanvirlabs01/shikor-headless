export interface User {
  id: string;
  email: string;
  role: "admin" | "editor" | "viewer";
}
