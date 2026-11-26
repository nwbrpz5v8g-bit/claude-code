# Service Booking App

A lightweight, dependency-free web app for booking appointments with a service business
(salon, repair shop, consultant, clinic, etc.).

## Features

**Customers**
- Browse services with duration and price
- Pick a date on a calendar (closed days, past days and fully booked days are disabled)
- Choose from available time slots — overlapping bookings are prevented automatically
- Enter contact details and get a booking reference
- Look up bookings by email and cancel upcoming ones

**Admin**
- Dashboard stats: today, upcoming, total bookings, completed revenue
- Bookings table with status filter and search; mark complete, cancel or delete
- Add, edit and delete services
- Configure business name, opening hours, open days, slot interval and currency

## Run it

No build step. Open `index.html` in a browser, or serve the folder:

```sh
cd service-booking-app
python3 -m http.server 8080
# then visit http://localhost:8080
```

## Data

All data is stored in the browser's `localStorage` (key `service-booking-app:v1`), so it is
per-browser and per-device. Use **Admin → Settings → Reset all data** to start over.
The admin area has no login; to run this for real customers you'd add a backend with
authentication, a shared database and email notifications.
