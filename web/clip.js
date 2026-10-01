/*
 영상 한 겹. 작가가 만든 액체 영상을 몸 안에서만 보이게 한다.

 액체의 생김새를 셰이더로 만드는 길과, 영상으로 만들어 와서 몸 안에 넣는 길이 있다.
 이 파일은 뒤의 길이다. 애프터이펙트나 파이널컷에서 만든 영상을 그대로 쓸 수 있다.

 넣는 법은 둘이다.
   화면의 「액체 영상 열기」로 파일을 고른다
   주소에 ?clip=clips/물.mp4 처럼 적는다 (web/ 기준 경로)

 영상은 화면 가득 깔리고, 셰이더가 몸 마스크로 오려 낸다. 몸 모양이 사람마다 달라도
 영상을 다시 만들 필요가 없다. 수면 아래쪽에만 보이므로 차오르고 빠지는 것도 그대로 된다.

 소리가 들어 있는 영상이면 소리는 끈다. 음악은 따로 둔다.
*/

export class Clip {
  constructor() {
    this.video = document.createElement("video");
    this.video.muted = true;
    this.video.loop = true;
    this.video.playsInline = true;
    this.ready = false;
    this.name = "";
  }

  /* 파일이나 주소를 받아 튼다 */
  async open(src) {
    this.ready = false;
    this.name = typeof src === "string" ? src : src.name;
    this.video.src = typeof src === "string" ? src : URL.createObjectURL(src);
    await this.video.play();
    this.ready = true;
    return this.name;
  }

  close() {
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
    this.ready = false;
    this.name = "";
  }

  /* 지금 프레임. 아직 틀 준비가 안 됐으면 null */
  frame() {
    return this.ready && this.video.readyState >= 2 ? this.video : null;
  }
}
