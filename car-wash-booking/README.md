# Mobile Car Wash Booking

A lightweight, dependency-free web app for a **home-service (mobile) car wash**: customers book
online and your team comes to their home or workplace.

## Customer booking flow

1. **Your area** — pick a service area; each area can carry a travel fee
2. **Package** — Exterior Wash, Inside & Out, Premium Wash & Wax, Full Detail
3. **Vehicle & extras** — vehicle size (surcharge + extra time) and optional add-ons,
   with a live total that includes the travel fee
4. **Date & arrival window** — only windows where a team is free for the whole job,
   including travel time to and from the previous job, are offered
5. **Address & details** — street address, parking/access notes, whether a water tap and
   power outlet are available, vehicle make/model/colour/plate, contact details, and a
   "I won't be home" option
6. **Confirmation** — arrival window, address, price payable on completion and a reference

Customers can look up bookings by **email or licence plate** and cancel upcoming ones.

## Admin

- **Jobs**: jobs today, value of today's jobs, upcoming jobs, completed revenue. Filter by Today / Upcoming /
  status and **by team**, search by name, address, plate or area. Each job shows the team,
  a Google Maps link to the address, access notes, tap/power availability, and a tap-to-call
  phone number. Mark jobs done, cancel or delete.
- **Pricing**: wash packages, add-ons, **service areas & travel fees**, vehicle-size surcharges.
- **Settings**: business name, first arrival / finish-by times, working days, start-time interval,
  **number of wash teams (vans)**, **travel time between jobs**, **arrival window length**, currency.

### How scheduling works

Each team handles one job at a time. A job occupies its team for the wash duration
plus the travel buffer, so the next job for that team can't start until it has had time to
drive over. New bookings are assigned to the first free team automatically. Same-day bookings
need at least one hour's notice.

## Run it

No build step. Open `index.html` in a browser, or serve the folder:

```sh
cd car-wash-booking
python3 -m http.server 8080
# then visit http://localhost:8080
```

## Data

All data is stored in the browser's `localStorage` (key `mobile-car-wash:v1`), so it is
per-browser and per-device. Use **Admin → Settings → Reset all data** to start over.
The admin area has no login; to take real customer bookings you'd add a backend with
authentication, a shared database and SMS/email confirmations.
