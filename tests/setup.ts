// Shared by unit and integration tests.
process.env.TZ = "UTC";
process.env.MAIL_TRANSPORT = "log";
// No calls to the breached-password service from tests (tested with a fake in breached tests).
process.env.PASSWORD_BREACH_CHECK = "off";
process.env.APP_URL = "http://localhost:3000";
