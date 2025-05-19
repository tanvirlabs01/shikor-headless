export type ConfigFieldType =
  | "string"
  | "number"
  | "boolean"
  | "secret"
  | "custom";

export type ConfigFieldDefinition = {
  key: string;
  type: ConfigFieldType;
  default?: any;
  envVar?: string;
  description?: string;
  version?: string;
  environments?: string[]; // e.g. ["development", "production"]
  group?: string;

  visibleTo?: string[] | ((config: any) => boolean);
  requiredIf?: (config: any) => boolean;
};

export type ModuleConfigSchema = Record<string, ConfigFieldDefinition>;

export type ValidationHooks = {
  pre?: (schema: Record<string, ModuleConfigSchema>) => void;
  post?: (config: Record<string, any>) => void;
};
