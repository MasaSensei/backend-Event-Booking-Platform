import {
  PaginationMeta,
  PaginatedResult,
} from '../interfaces/pagination.interface';

export function createPaginationMeta(
  total: number,
  page: number,
  limit: number,
): PaginationMeta {
  const lastPage = Math.ceil(total / limit);

  return {
    total,
    page,
    lastPage,
    limit,
    hasPreviousPage: page > 1,
    hasNextPage: page < lastPage,
  };
}

export function paginate<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  return {
    data,
    meta: createPaginationMeta(total, page, limit),
  };
}
