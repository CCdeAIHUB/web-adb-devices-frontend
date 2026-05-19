# Web ADB Devices Frontend

Vue 3.5 management UI for Web ADB Devices.

## Stack

- Vue 3.5
- Tailwind CSS 4
- Pinia
- Vue Router
- Iconify with `@iconify/json` and `@iconify/tailwind4`
- Vue I18n

## Security Defaults

- Route guards protect all management pages.
- Admin tokens are never stored in Pinia because the backend uses HttpOnly cookies.
- Production sourcemaps are disabled.
- Build output is minified and drops `console` and `debugger`.
