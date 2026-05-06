const axios = require("axios");

const ACCESS_TOKEN ="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJNYXBDbGFpbXMiOnsiYXVkIjoiaHR0cDovLzIwLjI0NC41Ni4xNDQvZXZhbHVhdGlvbi1zZXJ2aWNlIiwiZW1haWwiOiJyb3NobmlqYXlhbjE3QGdtYWlsLmNvbSIsImV4cCI6MTc3ODA2MDU2NCwiaWF0IjoxNzc4MDU5NjY0LCJpc3MiOiJBZmZvcmQgTWVkaWNhbCBUZWNobm9sb2dpZXMgUHJpdmF0ZSBMaW1pdGVkIiwianRpIjoiNDJlNGYyZDEtYjAxNS00YzQ3LTg0ZDktZjZkYjQ1MTNkZWYwIiwibG9jYWxlIjoiZW4tSU4iLCJuYW1lIjoicm9zaG5pIGoiLCJzdWIiOiIxNjMxMjU4OS0wZmFmLTRiZWMtOWM5Zi1iZjBkZmVkYTkwYjYifSwiZW1haWwiOiJyb3NobmlqYXlhbjE3QGdtYWlsLmNvbSIsIm5hbWUiOiJyb3NobmkgaiIsInJvbGxObyI6ImNiLnNjLnU0Y3NlMjMzNDUiLCJhY2Nlc3NDb2RlIjoiUFRCTW1RIiwiY2xpZW50SUQiOiIxNjMxMjU4OS0wZmFmLTRiZWMtOWM5Zi1iZjBkZmVkYTkwYjYiLCJjbGllbnRTZWNyZXQiOiJuYkt0Q1BlUHRWaGZHbUFXIn0.x420gf0s4blJnKKQRgR4b8sFI1EjZYyHrP9pOvadL3c" ;
const LOG_API = "http://20.207.122.201/evaluation-service/logs";


async function Log(stack, level, package_, message) {
  try {
    await axios.post(
      LOG_API,
      {
        stack,
        level,
        package: package_,
        message,
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    // Silent fail — logging must never crash the application
  }
}

module.exports = { Log };
