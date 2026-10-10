const timeFmt = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

export const formatTime = (iso: string | number) => timeFmt.format(new Date(iso));
export const formatDateTime = (iso: string | number) => dateTimeFmt.format(new Date(iso));
