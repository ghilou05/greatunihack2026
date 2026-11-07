"use client";

import { useState, type ChangeEvent, type DragEvent } from "react";
import styles from "./LessonPanel.module.css";

type Props = {
  onFile: (file: File) => void;
};

function isPdf(file: File): boolean {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

export function UploadScreen({ onFile }: Props) {
  const [dragging, setDragging] = useState(false);
  const [rejection, setRejection] = useState<string | null>(null);

  const accept = (file: File | undefined) => {
    if (!file) return;
    if (!isPdf(file)) {
      setRejection(`"${file.name}" isn't a PDF. Please choose a PDF file.`);
      return;
    }
    setRejection(null);
    onFile(file);
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    accept(event.dataTransfer.files[0]);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    accept(event.target.files?.[0]);
    // Lets the same file be picked again after an error.
    event.target.value = "";
  };

  return (
    <div className={styles.center}>
      <label
        className={`${styles.dropzone} ${dragging ? styles.dropzoneActive : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <input
          className={styles.fileInput}
          type="file"
          accept="application/pdf,.pdf"
          onChange={handleChange}
        />
        <span className={styles.dropzoneTitle}>Drop a PDF here</span>
        <span className={styles.muted}>or</span>
        <span className={styles.button}>Choose file</span>
      </label>
      {rejection && (
        <p className={styles.errorText} role="alert">
          {rejection}
        </p>
      )}
    </div>
  );
}
