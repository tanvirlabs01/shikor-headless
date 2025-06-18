export interface User {
  [x: string]: any;
  id: string;
  email: string;
  role: "admin" | "editor" | "viewer";
}
