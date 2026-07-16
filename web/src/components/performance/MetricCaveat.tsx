interface MetricCaveatProps {
  items: string[];
}

/**
 * Ghi chú giới hạn của số liệu. Trang này dùng để đánh giá con người, nên chỗ nào dữ liệu
 * không nói được thì phải nói ra ngay trên màn hình, không giấu vào tài liệu.
 */
export default function MetricCaveat({ items }: MetricCaveatProps) {
  return (
    <ul className="caveat">
      {items.map((text) => (
        <li key={text}>{text}</li>
      ))}
    </ul>
  );
}
