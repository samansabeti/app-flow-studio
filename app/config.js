export default {
  "studioName": "App Flow Studio",
  "studio": {
    "showOverview": true,
    "defaultView": "overview",
    "sidebar": { "collapsible": true }
  },
  "previewFiles": ["apps/daylight.js", "apps/blank.js"],
  "defaultApp": "daylight",
  "apps": [
    {
      "id": "daylight",
      "name": "Daylight",
      "module": "./apps/daylight.js"
    },
    {
      "id": "blank",
      "name": "Blank app",
      "module": "./apps/blank.js"
    }
  ]
};
