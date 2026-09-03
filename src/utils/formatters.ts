export const formatMileage = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return "—"
  }

  return new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: 0,
  }).format(value)
}

export const formatCurrency = (value: number | null) => {
  if (value === null) {
    return "Sin dato"
  }

  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(value)
}

export const formatDate = (value: string | null) => {
  if (!value) {
    return "Sin dato"
  }

  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`))
}

export const displayValue = (value: string | number | null | undefined, suffix = "") => {
  if (value === null || value === undefined || value === "") {
    return "Sin dato"
  }

  return `${value}${suffix}`
}
