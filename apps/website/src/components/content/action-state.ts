export type ActionState = {
  message: string;
  errors: Record<string, string[]>;
  values: Record<string, string>;
  success?: boolean;
};
export const initialActionState: ActionState = { message: "", errors: {}, values: {} };
