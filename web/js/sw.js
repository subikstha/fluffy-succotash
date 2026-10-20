"use strict";

const version = 7;
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
    "/css/style.css",
    "/images/logo.gif",
    "/images/",
  ],
};

self.addEventListener("install", onInstall);
self.addEventListener("activate", onActivate);
self.addEventListener("message", onMessage);
self.addEventListener("fetch", onFetch);

main().catch(console.error);

// 1. In the main whenever we start up we are gonna call sendMessage to request a status update

async function main() {
  console.log(`Service Worker (${version}) is starting...`);
  //   Requesting for online and logged in status informations
  await sendMessage({ requestStatusUpdate: true });
  // Also cache the responses whenever we restart the service worker in case we have anything missing from the cache
  await cacheLoggedOutFiles();
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

// This request is inbound coming from the page through our service worker
function onFetch(evt) {
  evt.respondWith(router(evt.request));
}

async function router(req) {
  var url = new URL(req.url);
  var reqURL = url.pathname; // This gets just the slash (/) parth of the url
  var cache = await caches.open(cacheName);

  // To only deal with routing with requests to our own server, we have to look at the origin property of these URLs
  // request for site's own URL
  if (url.origin === location.origin) {
    // are we making an API request?
    if (/^\/api\/.+$/.test(reqURL)) {
      // checks if reqURL starts with /api/ and has at least one character after it
      let res = await safeRequest(
        reqURL,
        req,
        fetchOptions,
        /*cacheResponse=*/ false, // This is telling donot handle the caching, i will handle it (here handled in line 105)
        /*checkCacheFirst=*/ false,
        /*checkCacheLast=*/ true,
        /*useRequestDirectly=*/ true,
      );

      if (res) {
        if (req.method == "GET") {
          await cache.put(reqURL, res.clone());
        }
        return res;
      }

      return notFoundResponse();
      // if (isOnline) {
      //   try {
      //     let fetchOptions = {
      //       method: req.method,
      //       headers: req.headers,
      //       credentials: "same-origin", // same-origin because some api calls do include the session cookie in it
      //       cache: "no-store",
      //     };

      //     res = await fetch(req.url, fetchOptions);

      //     if (res && res.ok) {
      //       if (req.method == "GET") {
      //         await cache.put(reqURL, res.clone());
      //       }
      //       return res;
      //     }
      //   } catch (err) {}

      //   res = await cache.match(reqURL);
      //   if (res) {
      //     return res;
      //   }

      //   return notFoundResponse(); // This is like a network level 404
      // }
    }

    // are we requesting a page?
    else if (req.headers.get("Accept").includes("text/html")) {
      console.log("Requesting a page");
      // login aware requests?
      if (/^\/(?:login|logout|add-post)$/.test(reqURL)) {
        // TODO:
      }
      // otherwise just use "network and cache"
      else {
        let fetchOptions = {
          method: req.method,
          headers: req.headers,
          cache: "no-store",
        };
        let res = await safeRequest(
          reqURL,
          req,
          fetchOptions,
          false,
          false,
          true,
          false,
        );

        if (res) {
          if (!res.headers.get("X-Not-Found")) {
            await cache.put(reqURL, res.clone());
          }
          return res;
        }

        // otherwise return an offline friendly page
        return cache.match("/offline");
        // if (isOnline) {
        //   try {
        //     // Here credentials is not used in fetch options since to get any pages credentials are not required
        //     let fetchOptions = {
        //       method: req.method,
        //       headers: req.headers,
        //       cache: "no-store",
        //     };
        //     res = await fetch(reqURL, fetchOptions);
        //     if (res && res.ok) {
        //       if (!res.headers.get("X-Not-Found")) {
        //         await cache.put(reqURL, res.clone());
        //       }
        //       return res;
        //     }
        //   } catch (err) {}
        // }

        // // failed fetch, so try cache
        // res = await cache.match(reqURL);
        // if (res) {
        //   return res;
        // }

        // // otherwise return an offline friendly page
        // return cache.match("/offline");
      }
    }
    // all other files use "cache first"
    else {
      let fetchOptions = {
        method: req.method,
        headers: req.headers,
        cache: "no-store",
      };
      let res = await safeRequest(
        reqURL,
        req,
        fetchOptions,
        /*cacheResponse=*/ true,
        /*checkCacheFirst=*/ true,
      );
      if (res) {
        return res;
      }

      // otherwise, force a network level 404 response
      return notFoundResponse();
    }
  }
  // TODO: Figure out CORS requests
}

async function safeRequest(
  reqURL,
  req,
  options,
  cacheResponse = false,
  checkCacheFirst = false,
  checkCacheLast = false,
  useRequestDirectly = false,
) {
  var cache = await caches.open(cacheName);
  var res;

  if (checkCacheFirst) {
    res = await caches.match(reqURL);
    if (res) {
      return res;
    }
  }

  if (isOnline) {
    try {
      if (useRequestDirectly) {
        res = await fetch(req, options); // This according to Kyle is a workaround for POST requests where in some cases req.body is not accessible
      } else {
        res = await fetch(reqURL, options);
      }

      if (res && (res.ok || res.type == "opaqueredirect")) {
        if (cacheResponse) {
          await cache.put(reqURL, res.clone());
        }
        return res;
      }
    } catch (err) {}
  }

  if (checkCacheLast) {
    res = await cache.match(reqURL);
    if (res) {
      return res;
    }
  }
}

function notFoundResponse() {
  return new Response("", {
    status: 404,
    statusText: "Not Found",
  });
}

async function onActivate(evt) {
  evt.waitUntil(handleActivation());
}

async function handleActivation() {
  // We clear the old cache here because when a service worker is activated, we for sure know that the old one is deleted
  await clearCaches();
  await cacheLoggedOutFiles(/*forceReload=*/ true); // This is saying i donot care if there are stuffs in the cache, just get it fresh
  await clients.claim();
  console.log(`Service Worker (${version}) is activated.`);
}

async function clearCaches() {
  var cacheNames = await caches.keys();
  var oldCacheNames = cacheNames.filter(function matchOldCache(cacheName) {
    if (/^ramblings-\d+$/.test(cacheName)) {
      let [, cacheVersion] = cacheName.match(/^ramblings-(\d+)$/);
      cacheVersion = cacheVersion != null ? Number(cacheVersion) : cacheVersion;
      return cacheVersion > 0 && cacheVersion != version;
    }
  });

  return Promise.all(
    oldCacheNames.map(function deleteCache(cacheName) {
      return caches.delete(cacheName);
    }),
  );
}

async function cacheLoggedOutFiles(forceReload = false) {
  // 1. Open the cache entry up so that we can start pushing stuff to it
  var cache = await caches.open(cacheName);

  return Promise.all(
    urlsToCache.loggedOut.map(async function requestFile(url) {
      // We want to use a try catch block so as to account for some kind of network errors
      // and we donot want this to crash
      try {
        let res;
        // If we have not asked to do a forced reload, then we should not unnecessarily cache these logged out files again
        // In some cases we want to forcibly ask for all of them and in other cases, we only just want to check if there are any that are not cached
        if (!forceReload) {
          res = await cache.match(url);
          if (res) return res;
        }

        let fetchOptions = {
          method: "GET",
          cache: "no-cache", // This is saying to the browser layer, donot store this response in your intermdediary cache, we want fresh results, if set to true service worker might get result from browser cache
          credentials: "omit",
        };

        res = await fetch(url, fetchOptions);
        if (res.ok) {
          await cache.put(url, res.clone()); // You cannot put the response into the cache but have to clone it
        }
      } catch (err) {}
    }),
  );
}
