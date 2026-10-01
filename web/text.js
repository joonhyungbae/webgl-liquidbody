/*
 글. 질문을 띄우고, 관객이 적은 답을 액체가 지워 간다.

 글자는 2D 그림판 한 장에 그려 셰이더로 넘긴다. 셰이더는 액체가 지나간 자리의 글자를
 지운다(look.js 의 wash). 물이 차오르며 글이 사라지는 것이 이 작품의 핵심이라, 지우는
 쪽은 글이 아니라 액체가 맡는다.

 답을 받는 길은 지금 둘이다. 화면 아래의 칸에 적거나(전시에서는 태블릿), 아무것도 적지
 않거나. 적지 않아도 작품은 끝까지 간다.

 적은 글은 이 브라우저의 메모리에만 있다. 파일로도 서버로도 보내지 않는다.
*/

import { LINES, LINE_SECONDS } from "./settings.js";

export class Text {
  constructor(w = 640, h = 480) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext("2d");
    this.answer = "";
    this.shown = -1;
  }

  /* 답을 적거나 지운다. 전시에서는 태블릿에서 들어온다 */
  say(text) {
    this.answer = String(text || "").replace(/\s+/g, " ").slice(0, 60);
  }

  /* 지금 보일 글 한 줄. 결계와 차오름의 앞부분에만 질문이 뜬다 */
  line(w) {
    if (w.phase === "ring") return LINES[0];
    if (w.phase === "fill") {
      const i = Math.floor(w.filled * LINES.length * 0.6);
      if (this.answer) return this.answer;
      return w.t < LINE_SECONDS * LINES.length ? LINES[Math.min(LINES.length - 1, i)] : "";
    }
    if (w.phase === "hold" || w.phase === "drain") return this.answer;
    return "";
  }

  /* 글 한 장을 다시 그린다. 바뀐 것이 없으면 그리지 않는다 */
  draw(w, p) {
    const line = p.text ? this.line(w) || "" : "";
    if (line === this.shown) return false;
    this.shown = line;
    const c = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    c.clearRect(0, 0, W, H);
    if (!line) return true;
    const size = Math.round(W * (line.length > 26 ? 0.032 : 0.042));
    c.font = `300 ${size}px system-ui, -apple-system, "Pretendard", sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "#fff";
    // 셰이더는 이 글자의 불투명도만 본다. 색은 셰이더가 입힌다
    const words = line.split(" ");
    const rows = [];
    let row = "";
    for (const word of words) {
      const next = row ? `${row} ${word}` : word;
      if (c.measureText(next).width > W * 0.76 && row) {
        rows.push(row);
        row = word;
      } else row = next;
    }
    if (row) rows.push(row);
    const y0 = H * 0.3 - ((rows.length - 1) * size * 1.5) / 2;
    rows.forEach((r, i) => c.fillText(r, W / 2, y0 + i * size * 1.5));
    return true;
  }
}
