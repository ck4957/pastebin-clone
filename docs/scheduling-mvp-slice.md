# Scheduling MVP Slice

This PR adds a mock-data scheduling engine slice for the behavioral-health MVP scope in issue #1.

What is included:

- provider availability rules by weekday, time window, appointment length, drive buffer, and ZIP coverage
- existing appointment conflict checks with provider-specific drive-time buffers
- ranked candidate slots using exact ZIP coverage and route-cluster proximity
- recurring-series grouping by provider, weekday, and time
- focused tests using only synthetic provider IDs, ZIP codes, and appointment times

What is intentionally not included:

- Twilio, Google Calendar, or map API credentials
- client names, diagnoses, notes, phone numbers, or other PHI
- calendar writes or SMS side effects
- AI clinical behavior

This is meant to be a first reviewable foundation before wiring real integrations. The next milestone can wrap this engine with a dashboard, SMS consent and opt-out state, Google Calendar read/write adapters, and audit logs.
