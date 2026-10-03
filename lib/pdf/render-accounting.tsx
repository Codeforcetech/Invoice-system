import React from "react";
import path from "node:path";
import {
  Document,
  Page,
  Text,
  View,
  Font,
  renderToBuffer,
} from "@react-pdf/renderer";
Font.register({
  family: "AccountingJP",
  src: path.join(process.cwd(), "assets/fonts/NotoSansJP-Regular.ttf"),
});
Font.registerHyphenationCallback((word) => Array.from(word));
export async function renderAccountingPdf(
  title: string,
  period: string,
  headers: string[],
  rows: (string | number)[][],
  options?: { note?: string; widths?: number[] },
) {
  const widths =
    options?.widths ??
    (headers.length === 6
      ? [65, 185, 145, 80, 80, 90]
      : [60, 95, 165, 55, 95, 65, 65, 65, 90]);
  return renderToBuffer(
    <Document title={title}>
      <Page
        size="A4"
        orientation="landscape"
        style={{
          fontFamily: "AccountingJP",
          fontSize: 8,
          padding: 28,
          paddingBottom: 42,
          color: "#132b32",
        }}
      >
        <View fixed>
          <Text style={{ fontSize: 18, marginBottom: 5 }}>{title}</Text>
          <Text style={{ fontSize: 9, marginBottom: 12 }}>
            {options?.note ?? `${period} ／ 円・税込経理`} ／ SEIQ
          </Text>
          <View
            style={{
              flexDirection: "row",
              backgroundColor: "#edf2f2",
              paddingVertical: 7,
            }}
          >
            {headers.map((h, i) => (
              <Text key={h} style={{ width: widths[i], paddingHorizontal: 4 }}>
                {h}
              </Text>
            ))}
          </View>
        </View>
        {rows.map((row, i) => (
          <View
            key={i}
            wrap={false}
            style={{
              flexDirection: "row",
              borderBottomWidth: 0.5,
              borderColor: "#dbe3e3",
              paddingVertical: 7,
            }}
          >
            {row.map((c, j) => (
              <Text
                key={j}
                style={{
                  width: widths[j],
                  paddingHorizontal: 4,
                  textAlign: typeof c === "number" ? "right" : "left",
                }}
              >
                {typeof c === "number" ? c.toLocaleString("ja-JP") : c}
              </Text>
            ))}
          </View>
        ))}
        {!rows.length && (
          <Text style={{ marginTop: 15 }}>該当する取引はありません。</Text>
        )}
        <Text
          fixed
          style={{
            position: "absolute",
            bottom: 16,
            left: 28,
            right: 28,
            fontSize: 8,
            textAlign: "right",
          }}
          render={({ pageNumber, totalPages }) =>
            `${pageNumber} / ${totalPages}`
          }
        />
      </Page>
    </Document>,
  );
}
