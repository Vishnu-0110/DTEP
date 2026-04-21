declare module 'axios' {
  export interface AxiosRequestConfig {
    __dtep_retry_count?: number;
    __dtep_skip_retry?: boolean;
  }
}

export {};

