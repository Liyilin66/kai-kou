export function parseAgentContent(content = "") {
  const lines = `${content || ""}`.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let paragraphBuffer = [];

  const flushParagraph = () => {
    const paragraph = paragraphBuffer
      .map((line) => sanitizeInlineText(line))
      .join("\n")
      .trim();

    if (paragraph) {
      blocks.push({
        type: "paragraph",
        text: paragraph
      });
    }

    paragraphBuffer = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const currentLine = lines[index];
    const nextLine = lines[index + 1];

    if (isPotentialTableHeader(currentLine) && isTableDivider(nextLine)) {
      const headerCells = parseTableRow(currentLine);
      const bodyRows = [];
      let cursor = index + 2;

      while (cursor < lines.length && isTableDataRow(lines[cursor])) {
        const rowCells = parseTableRow(lines[cursor], headerCells.length);
        if (rowCells.length) {
          bodyRows.push(rowCells);
        }
        cursor += 1;
      }

      if (headerCells.length >= 2 && bodyRows.length >= 1) {
        flushParagraph();
        blocks.push({
          type: "table",
          headers: headerCells,
          rows: bodyRows
        });
        index = cursor - 1;
        continue;
      }
    }

    if (!`${currentLine || ""}`.trim()) {
      flushParagraph();
      continue;
    }

    paragraphBuffer.push(currentLine);
  }

  flushParagraph();
  return blocks;
}

export function sanitizeInlineText(value = "") {
  return `${value || ""}`
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .trim();
}

function isPotentialTableHeader(line = "") {
  const text = `${line || ""}`.trim();
  if (!text.includes("|")) return false;
  return parseTableRow(text).length >= 2;
}

function isTableDivider(line = "") {
  const text = `${line || ""}`.trim();
  if (!text.includes("|")) return false;

  const cells = text
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean);

  if (cells.length < 2) return false;
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isTableDataRow(line = "") {
  const text = `${line || ""}`.trim();
  if (!text.includes("|")) return false;
  return parseTableRow(text).length >= 2;
}

function parseTableRow(line = "", targetColumnCount = 0) {
  const rawCells = `${line || ""}`
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => sanitizeInlineText(cell))
    .filter((cell, index, array) => cell || array.length === 1 || targetColumnCount > 0);

  if (!targetColumnCount || rawCells.length === targetColumnCount) {
    return rawCells;
  }

  if (rawCells.length > targetColumnCount) {
    return rawCells.slice(0, targetColumnCount);
  }

  const paddedCells = [...rawCells];
  while (paddedCells.length < targetColumnCount) {
    paddedCells.push("");
  }
  return paddedCells;
}
