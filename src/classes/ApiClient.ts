import {RequestHeaders} from "../types.js";

const API_BASE = "https://mail.infomaniak.com/api";

export default class ApiClient {
  readonly #headers: RequestHeaders;

  constructor(token: string) {
    this.#headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.#headers,
        ...(options.headers as Record<string, string> || {}),
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}\n${text}`,
      );
    }

    return response.json();
  }
}
