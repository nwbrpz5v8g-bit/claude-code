# Car Wash Booking

A lightweight, dependency-free web app that lets customers book car washes online
and gives staff a simple admin view.

## Features

**Customers**
- Choose a wash package (Express Exterior, Inside & Out, Deluxe Wash & Wax, Full Valet)
- Pick a vehicle size — larger vehicles add a surcharge and extra time
- Add optional extras (tyre shine, rain-repellent glass, pet hair removal, engine bay clean…)
  with a live price and duration total
- Pick a date and time; only times with a free wash bay for the whole job are offered
- Enter contact and vehicle details (make/model, colour, licence plate) and get a reference
- Look up bookings by email **or licence plate** and cancel upcoming ones

**Staff / admin**
- Stats: cars today, value of today's bookings, upcoming, completed revenue
- Bookings table with Today / Upcoming / status filters and search by name, plate or vehicle;
  mark washes done, cancel or delete
- Manage wash packages, add-ons and vehicle-size surcharges
- Settings: business name, opening hours, open days, start-time interval,
  **number of wash bays** (how many cars can be washed at once) and currency

## Run it

No build step. Open `index.html` in a browser, or serve the folder:

```sh
cd car-wash-booking
python3 -m http.server 8080
# then visit http://localhost:8080
```

## Data

All data is stored in the browser's `localStorage` (key `car-wash-booking:v1`), so it is
per-browser and per-device. Use **Admin → Settings → Reset all data** to start over.
The admin area has no login; to take real customer bookings you'd add a backend with
authentication, a shared database and SMS/email confirmations.
