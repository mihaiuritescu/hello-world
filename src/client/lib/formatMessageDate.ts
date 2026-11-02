// The mockups' date (01/02/2017), followed by the time of day.
const messageDate = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/** A message's date as `01/02/2017, 14:05`, in the reader's time zone. */
export function formatMessageDate(isoDate: string): string {
  return messageDate.format(new Date(isoDate))
}
