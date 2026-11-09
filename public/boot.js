window.addEventListener("error", function (event) {
  var banner = document.getElementById("boot-error");
  if (!banner) return;
  banner.hidden = false;
  banner.textContent = "สไลด์แรกยังเปิดอยู่ แม้สคริปต์ส่วนอื่นจะสะดุด — " + ((event && event.message) || "error");
});
