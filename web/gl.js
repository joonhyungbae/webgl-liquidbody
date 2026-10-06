/*
 WebGL 뒷일. 셰이더를 올리고, 그림판 한 장을 화면 가득 그린다.

 작가가 여기를 고칠 일은 거의 없다. 그림의 성격은 look.js 의 셰이더가 정한다.
 이 파일은 그 셰이더를 돌리기 위한 준비(사각형 하나, 텍스처 두 장, 유니폼 전달)만 한다.

 WebGL2 가 없는 기계도 있다. 그때는 make() 가 null 을 돌려주고, 화면은 2D 로 내려간다.
*/

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) || "셰이더를 올리지 못했습니다");
  }
  return sh;
}

export function make(canvas, frag) {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, premultipliedAlpha: false });
  if (!gl) return null;

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prog) || "셰이더를 잇지 못했습니다");
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uniforms = new Map();
  const where = (name) => {
    if (!uniforms.has(name)) uniforms.set(name, gl.getUniformLocation(prog, name));
    return uniforms.get(name);
  };

  /* 한 칸에 하나의 값(마스크)을 담는 텍스처 */
  const grayTexture = (unit) => {
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    for (const [k, v] of [
      [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
    ]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return tex;
  };

  const maskTex = grayTexture(0);
  const textTex = grayTexture(1);
  const clipTex = grayTexture(2);
  const paintTex = grayTexture(3);
  let maskSize = [0, 0];

  return {
    gl,
    /* 몸 마스크를 올린다. 0~1 의 값 한 장 */
    mask(data, w, h) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, maskTex);
      if (maskSize[0] !== w || maskSize[1] !== h) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, w, h, 0, gl.RED, gl.FLOAT, data);
        maskSize = [w, h];
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RED, gl.FLOAT, data);
      }
    },
    /* 글자 한 장을 올린다. 2D 그림판을 그대로 쓴다 */
    text(canvas2d) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, textTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas2d);
    },
    /* 작가가 만든 액체 영상의 지금 프레임을 올린다 */
    clip(video) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, clipTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    },
    /* 그림 모델이 칠한 그림을 올린다 */
    paint(canvas2d) {
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, paintTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas2d);
    },
    draw(values) {
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform1i(where("uMask"), 0);
      gl.uniform1i(where("uText"), 1);
      gl.uniform1i(where("uClip"), 2);
      gl.uniform1i(where("uPaint"), 3);
      for (const [name, v] of Object.entries(values)) {
        const u = where(name);
        if (u === null) continue;
        if (Array.isArray(v)) gl.uniform2f(u, v[0], v[1]);
        else gl.uniform1f(u, v);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}
