export function normalizeBlogQuery(
  content: string | string[] | undefined,
  orderBy: string | string[] | undefined
) {
  return {
    content: (Array.isArray(content) ? content[0] : content)?.trim() ?? "",
    orderBy: ((Array.isArray(orderBy) ? orderBy[0] : orderBy) === "asc" ? "asc" : "desc") as
      | "asc"
      | "desc",
  };
}
