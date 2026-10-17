"use strict";

const version = 3;
var isOnline = true;
var isLoggedIn = false;
var cacheName = `ramblings-${version}`; // String name to refer to collection of cached items
// When version number updates, all cached items are gonna re cached under a new cache name and the old caches are gonna go away

// Here according to Kyle we donot have to specify extension for pages like about.html etc since the server is doing URL rewriting
var urlsToCache = {
  loggedOut: [
    "/",
    "/about",
    "/contact",
    "/404",
    "/login",
    "/offline",
    "/js/blog.js",
    "/js/home.js",
    "/js/login.js",
    "/js/add-post.js",
    "/css/styles.css",
    "/images/logo.gif",
    "/images/",
  ],
};

self.addEventListener("install", onInstall);
self.addEventListener("activate", onActivate);
self.addEventListener("message", onMessage);

main().catch(console.error);

// 1. In the main whenever we start up we are gonna call sendMessage to request a status update

async function main() {
  console.log(`Service Worker (${version}) is starting...`);
  //   Requesting for online and logged in status informations
  await sendMessage({ requestStatusUpdate: true });
}

async function onInstall(evt) {
  console.log(`Service Worker (${version}) is installed.`);
  //   To skip the waiting phase we use skipWaiting()
  self.skipWaiting();
}

async function sendMessage(msg) {
  // We have to handle the case where there will be multiple clients
  // First get a list of all the clients
  var allClients = await clients.matchAll({ includeUncontrolled: true });
  //   Post messages in service workers are promise returning APIs bcoz they are asynchronous
  //   so we need to listen for all those promises to finish
  return Promise.all(
    allClients.map(function clientMsg(client) {
      // Making a new message channel for each client that we are talking to
      var chan = new MessageChannel(); // This creates two port one for me and one for the remote
      chan.port1.onmessage = onMessage; // Listen for messages from that message channel and route it to the onMessage handler
      return client.postMessage(msg, [chan.port2]); // this returns a promise
      //   NOTE: port1 is me that is how i receive messages
      // port2 is how you receive messages
      // Send on port2 and listen on port1
    }),
  );
}

function onMessage({ data }) {
  if (data.statusUpdate) {
    ({ isOnline, isLoggedIn } = data.statusUpdate);
    console.log(
      `Service Worker (v${version}) status update, isOnline: ${isOnline}, isLoggedIn: ${isLoggedIn}`,
    );
  }
}

async function onActivate(evt) {
  evt.waitUntil(handleActivation());
}

async function handleActivation() {
  await clients.claim();
  console.log(`Service Worker (${version}) is activated.`);
}
