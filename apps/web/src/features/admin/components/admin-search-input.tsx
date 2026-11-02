import styles from './admin-components.module.css';

interface AdminSearchInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function AdminSearchInput({
  label,
  value,
  onChange,
  placeholder = 'Tìm kiếm',
}: AdminSearchInputProps) {
  return (
    <label className={styles.searchField}>
      <span>{label}</span>
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}
