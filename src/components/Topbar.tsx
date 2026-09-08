"use client";

import { useRouter } from "next/navigation";

interface Props {
  title: string;
  /** Show a back chevron */
  back?: boolean;
  /** Right side accessory (icon button etc.) */
  right?: React.ReactNode;
  /** left avatar (main screen) */
  avatar?: string;
}

export function Topbar({ title, back, right, avatar }: Props) {
  const router = useRouter();
  return (
    <header className="topbar">
      {back ? (
        <button
          className="back"
          aria-label="Назад"
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
        >
          ‹
        </button>
      ) : (
        avatar && <div className="avatar">{avatar}</div>
      )}
      <div className="title">{title}</div>
      {right && <div style={{ display: "flex", alignItems: "center" }}>{right}</div>}
    </header>
  );
}
