export type BearerToken = `Bearer ${string}`;

export interface RequestHeaders {
  Authorization: BearerToken;
  "Content-Type": "application/json";
}
