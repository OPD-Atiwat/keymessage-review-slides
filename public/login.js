const form = document.getElementById("login-form");
const error = document.getElementById("login-error");
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  error.textContent = "";
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: document.getElementById("password").value }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    error.textContent = data.error || "เข้าสู่ระบบไม่สำเร็จ";
    return;
  }
  location.href = "/";
});
