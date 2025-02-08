export type StatusResponse = "Inactive" | "Initializing" | "Ready";

export type MethodParam = {
    method_name: string,
    method_assembly: string,
    method_typename: string
};

export type MethodResponse = {
    file: string
}[];
