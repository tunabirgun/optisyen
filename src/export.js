export async function exportScores(
  headers,
  rows,
  firstScore,
  means,
  responses,
) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Tuna Birgün";
  const scores = workbook.addWorksheet("Soru Puanları");
  const answers = workbook.addWorksheet("Cevaplar");
  scores.addRow(headers);
  answers.addRow(headers.slice(0, -1));
  for (const row of rows) {
    const added = scores.addRow(row);
    const first = added.getCell(firstScore + 1).address;
    const last = added.getCell(headers.length - 1).address;
    added.getCell(headers.length).value = {
      formula: "ROUND(SUM(" + first + ":" + last + "),8)",
      result: row.at(-1),
    };
  }
  for (const row of responses) answers.addRow(row);
  for (const sheet of [scores, answers]) {
    sheet.views = [{ state: "frozen", ySplit: 1, xSplit: firstScore }];
    sheet.columns.forEach((col, i) => {
      col.width = i === 1 ? 30 : i === 0 ? 18 : 12;
    });
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF292E33" },
    };
    sheet.getRow(1).height = 22;
  }
  const footer = scores.addRow(["ORTALAMA"]);
  scores.mergeCells(footer.number, 1, footer.number, firstScore);
  means.forEach((mean, i) => {
    const column = scores.getColumn(firstScore + i + 1);
    const cell = footer.getCell(column.number);
    cell.value = {
      formula:
        "AVERAGE(" +
        column.letter +
        "2:" +
        column.letter +
        (footer.number - 1) +
        ")",
      result: mean,
    };
    cell.numFmt = "0.00";
  });
  footer.font = { bold: true };
  footer.height = 20;
  footer.alignment = { vertical: "middle", horizontal: "center" };
  footer.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8ECEE" },
  };
  return new Blob([await workbook.xlsx.writeBuffer()], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
