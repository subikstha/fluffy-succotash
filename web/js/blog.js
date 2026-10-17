(function Blog() {
  console.log("hello");
  ("use strict");

  var offlineIcon;
  var isOnline = "onLine" in navigator ? navigator.onLine : true;
  var isLoggedIn = /isLoggedIn=1/.test(document.cookie.toString() || "");
  var usingSW = "serviceWorker" in navigator;
  var swRegistration;
  var svcworker;

  document.addEventListener("DOMContentLoaded", ready, false);

  initServiceWorker().catch(console.error);

  // **********************************

  function ready() {
    console.log("isOnline is", isOnline);
    offlineIcon = document.getElementById("connectivity-status");
    console.log("connectivity icon", offlineIcon);

    if (!isOnline) {
      offlineIcon.classList.remove("hidden");
    }

    window.addEventListener("online", function online() {
      console.log("online event detected");
      offlineIcon.classList.add("hidden");
      isOnline = true;
      sendStatusUpdate(); // we are not choosing the target here, it is going to be picked automatically
    });

    window.addEventListener("offline", function offline() {
      console.log("offline event detected");
      offlineIcon.classList.remove("hidden");
      isOnline = false;
      sendStatusUpdate();
    });
  }

  async function initServiceWorker() {
    // Technically we donot need to call register if we have a servicee worker that has not changed
    // but it is a good practice to call register since someone might delete the service worker registration
    swRegistration = await navigator.serviceWorker.register("/sw.js", {
      updateViaCache: "none",
    });

    svcworker =
      swRegistration.installing ||
      swRegistration.waiting ||
      swRegistration.active;
    sendStatusUpdate(svcworker);

    // Listen for event when a new service worker has taken control over the page
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      function onController() {
        // If we have a new service worker, then we need to reassign svcworker
        svcworker = navigator.serviceWorker.controller;
        sendStatusUpdate(svcworker); // Proactively sending the status during controllerchange
      },
    );

    // Listen for messages from SW to the page
    navigator.serviceWorker.addEventListener("message", onSWMessage);
  }

  function onSWMessage(evt) {
    var { data } = evt;
    if (data.requestStatusUpdate) {
      // This is SW asking page hey page can you give me some update on some stuff
      // We might want the SW to know about the online status / logged in status etc
      console.log(
        "Received status update request from service worker, responding...",
      );
      // We might think that the target in the sendStatusUpdate to be the svcworker,
      // but since the service worker might be communicating with multiple pages, we
      // end up using what is called a message channel to make these connections
      // The message channel comes with unique set of ports for communication between the page and the service worker
      // evt.ports[0] is a specific message channel port that the service worker is listening on
      // and it is the target that we post message to
      sendStatusUpdate(evt.ports && evt.ports[0]);
    }
  }

  function sendStatusUpdate(target) {
    sendSWMessage({ statusUpdate: { isOnline, isLoggedIn } }, target);
  }

  // Function to send message to SW from the page
  function sendSWMessage(msg, target) {
    if (target) {
      target.postMessage(msg);
    } else if (svcworker) {
      svcworker.postMessage(msg);
    } else {
      navigator.serviceWorker.controller.postMessage(msg);
    }
  }
})();
