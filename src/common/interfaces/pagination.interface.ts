export interface PaginationMeta {
  total: number;
  page: number;
  lastPage: number;
  limit: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}
