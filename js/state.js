"use strict";
var state = {
  lang: "en",
  theme: "dark",
  primary: "teal",
  orders: [],
  loaded: false,
  search: "",
  sort: "status",
  monthYear: "all",
  status: "all"
};

var headerData = { title: "", subtitle: "", image: "" };
var tempHeaderImage = { type: "upload", value: "" };

var tempMain = { type: "upload", value: "" }; // value = dataURL or URL string
var tempMainThumb = "";                        // small preview of an uploaded main image (keeps the list light)
var pasteZone = null; // "main" | "proof" — where the next pasted image goes (last zone the user touched)
var tempProofs = []; // array of strings (dataURL or URL)
var editingId = null;
