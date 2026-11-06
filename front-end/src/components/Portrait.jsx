function initials(name) {
  return name.split(' ').map(word => word[0]).slice(0, 2).join('');
}

export default function Portrait({ row, size = 44, className = '' }) {
  return (
    <span className={`portrait ${className}`} style={{ '--candidate': row.color }}>
      {row.photo
        ? <img src={`${import.meta.env.BASE_URL}${row.photo}`} alt="" width={size} height={size} loading="lazy" />
        : <span>{initials(row.name)}</span>}
    </span>
  );
}
