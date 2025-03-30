const express = require('express');
const router = express.Router();
const { fetchEventDetails } = require('./api');

// GET /api/TBA-matches/test - Returns raw event data
router.get('/test', async (req, res) => {
  const { eventKey } = req.query;
  const [eventDetails] = await Promise.all([
    fetchEventDetails(eventKey)
  ]);
  res.send(eventDetails);
});
// GET / - Full page version of team match display
router.get('/', async (req, res) => {
  const { teamKey, eventKey } = req.query;
  
  // If teamKey or eventKey are not provided, render an input form
  if (!teamKey || !eventKey) {
    const formHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Enter Team and Event Keys</title>
      <style>
        body { font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 40px; }
        .form-container { max-width: 400px; margin: 0 auto; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
        label { display: block; margin-top: 10px; }
        input[type="text"] { width: 100%; padding: 8px; margin-top: 5px; }
        button { margin-top: 15px; padding: 10px 15px; font-size: 1em; background: #0277bd; color: #fff; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background: #01579b; }
      </style>
    </head>
    <body>
      <div class="form-container">
        <h2>Enter Details</h2>
        <form method="get" action="/">
          <label for="teamKey">Team Key:</label>
          <input type="text" name="teamKey" id="teamKey" required placeholder="ex: frc254" />
          <label for="eventKey">Event Key:</label>
          <input type="text" name="eventKey" id="eventKey" required placeholder="ex: 2025miket" />
          <button type="submit">Submit</button>
        </form>
      </div>
    </body>
    </html>
    `;
    return res.send(formHtml);
  }
  
  // Format team number (remove "frc" prefix if present)
  const formattedTeamKey = teamKey.startsWith('frc') ? teamKey.substring(3) : teamKey;
  
  try {
    // Load match data
    const eventData = await fetchEventDetails(eventKey);
    if (!eventData) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    let matches = [...eventData.matches]; // Create a copy we can modify
    const nowQueuing = eventData.nowQueuing;
    
    // Sort matches by their sequence (match type then number)
    matches.sort((a, b) => {
      const aType = a.label.split(' ')[0];
      const bType = b.label.split(' ')[0];
      
      if (aType !== bType) return aType.localeCompare(bType);
      
      const aNum = parseInt(a.label.split(' ')[1]);
      const bNum = parseInt(b.label.split(' ')[1]);
      return aNum - bNum;
    });
    
    // Auto-complete logic: mark earlier "On field" match as "Completed" if a later one is "On field"
    for (let i = 0; i < matches.length - 1; i++) {
      if (matches[i].status === "On field") {
        for (let j = i + 1; j < matches.length; j++) {
          if (matches[j].status === "On field") {
            matches[i].status = "Completed";
            break;
          }
        }
      }
    }
    
    // Filter matches for the requested team
    const teamMatches = matches.filter(match => 
      Array.isArray(match.redTeams) && match.redTeams.includes(formattedTeamKey) || 
      Array.isArray(match.blueTeams) && match.blueTeams.includes(formattedTeamKey)
    );
    
    // Group matches by type and separate completed matches
    const matchGroups = {};
    const completedMatches = [];
    teamMatches.forEach(match => {
      if (match.status === "Completed") {
        completedMatches.push(match);
      } else {
        const matchType = match.label.split(' ')[0];
        if (!matchGroups[matchType]) {
          matchGroups[matchType] = [];
        }
        matchGroups[matchType].push(match);
      }
    });
    
    // Generate full page HTML output (notice no fixed container height)
    let htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Team ${formattedTeamKey} Matches</title>
      <style>
        body {
          font-family: 'Roboto', 'Segoe UI', sans-serif;
          background-color: #0a0a0a;
          color: #e0e0e0;
          margin: 0;
          padding: 0;
        }
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 15px;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }
        .header {
          background: linear-gradient(135deg, #8B0000, #660000);
          color: white;
          padding: 18px 20px;
          border-radius: 10px 10px 0 0;
          text-align: center;
          font-weight: bold;
          font-size: 1.3em;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        .event-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 15px;
          background-color: #1a1a1a;
          border-bottom: 1px solid #333;
          font-size: 0.9em;
        }
        .now-queuing {
          font-weight: bold;
          color: #ff9800;
        }
        .content {
          flex: 1;
          overflow-y: auto;
          padding: 10px 0;
          scrollbar-width: thin;
          scrollbar-color: #444 #1a1a1a;
        }
        .content::-webkit-scrollbar {
          width: 8px;
        }
        .content::-webkit-scrollbar-track {
          background: #1a1a1a;
        }
        .content::-webkit-scrollbar-thumb {
          background-color: #444;
          border-radius: 4px;
        }
        .match-group {
          margin-bottom: 25px;
        }
        .match-group-title {
          font-size: 1.1em;
          font-weight: bold;
          color: #4fc3f7;
          padding: 10px 5px;
          margin-bottom: 10px;
          border-bottom: 1px solid #333;
        }
        .match-card {
          background-color: #1d1d1d;
          border-radius: 8px;
          margin-bottom: 12px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          transition: all 0.3s ease;
        }
        .match-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 3px 6px rgba(0,0,0,0.3);
        }
        .match-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 15px;
          cursor: pointer;
          user-select: none;
          transition: background-color 0.2s;
        }
        .match-header:hover {
          background-color: #252525;
        }
        .match-header-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .alliance-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          display: inline-block;
        }
        .red-alliance {
          background-color: #f44336;
        }
        .blue-alliance {
          background-color: #2196f3;
        }
        .match-number {
          font-weight: bold;
          font-size: 1.1em;
        }
        .match-status {
          font-size: 0.8em;
          padding: 3px 8px;
          border-radius: 12px;
          margin-left: 10px;
          font-weight: 500;
        }
        .status-default {
          background-color: #424242;
        }
        .status-queuing {
          background-color: #ff9800;
          color: #000;
        }
        .status-on-deck {
          background-color: #ffc107;
          color: #000;
        }
        .status-on-field {
          background-color: #8bc34a;
          color: #000;
        }
        .match-time {
          font-size: 0.9em;
          color: #bbb;
        }
        .match-content {
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.3s ease-out;
          background-color: #252525;
        }
        .match-card.active .match-content {
          max-height: 500px;
        }
        .match-details {
          padding: 15px;
          border-top: 1px solid #333;
        }
        .alliance-section {
          margin-bottom: 15px;
        }
        .alliance-title {
          font-weight: bold;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
        }
        .red-title {
          color: #f44336;
        }
        .blue-title {
          color: #2196f3;
        }
        .alliance-teams {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .team-chip {
          display: inline-flex;
          align-items: center;
          background-color: #333;
          padding: 6px 12px;
          border-radius: 16px;
          font-size: 0.9em;
          border-left: 3px solid transparent;
        }
        .team-chip.highlight {
          background-color: #01579b;
          font-weight: bold;
        }
        .red-team {
          border-color: #f44336;
        }
        .blue-team {
          border-color: #2196f3;
        }
        .time-section {
          margin-top: 15px;
          font-size: 0.85em;
          color: #aaa;
        }
        .time-label {
          font-weight: bold;
          color: #bbb;
          margin-bottom: 5px;
        }
        .time-row {
          margin-bottom: 5px;
        }
        .break-indicator {
          margin-top: 10px;
          padding: 8px;
          background-color: rgba(255, 193, 7, 0.1);
          border-left: 3px solid #ffc107;
          font-style: italic;
          color: #ffc107;
          border-radius: 4px;
        }
        .footer {
          font-size: 0.8em;
          color: #777;
          text-align: center;
          padding: 12px;
          background-color: #1a1a1a;
          border-radius: 0 0 10px 10px;
          border-top: 1px solid #333;
        }
        .no-matches {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
          text-align: center;
          color: #888;
          font-size: 1.1em;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          Team ${formattedTeamKey} Matches at ${eventKey}
        </div>
        <div class="event-info">
          <span>Event: ${eventKey}</span>
          <span class="now-queuing">Now Queuing: ${nowQueuing || 'N/A'}</span>
        </div>
        <div class="content">
    `;
    
    if (Object.keys(matchGroups).length === 0 && completedMatches.length === 0) {
      htmlContent += `
        <div class="no-matches">
          <p>No matches found for team ${formattedTeamKey}</p>
        </div>`;
    } else {
      // Iterate through match groups for active/upcoming matches
      Object.keys(matchGroups).forEach(groupType => {
        htmlContent += `
          <div class="match-group">
            <div class="match-group-title">${groupType} Matches</div>
        `;
        const sortedMatches = matchGroups[groupType].sort((a, b) => {
          const aNum = parseInt(a.label.split(' ')[1]);
          const bNum = parseInt(b.label.split(' ')[1]);
          return aNum - bNum;
        });
        sortedMatches.forEach(match => {
          const isRed = match.redTeams.includes(formattedTeamKey);
          const allianceColor = isRed ? "red" : "blue";
          let timeDisplay = "TBD";
          if (match.times.scheduledStartTime) {
            const matchDate = new Date(match.times.scheduledStartTime);
            timeDisplay = matchDate.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              timeZone: 'Canada/Eastern' // Ensure EST
            });
          }
          let statusClass = "status-default";
          if (match.status === "Now queuing") statusClass = "status-queuing";
          else if (match.status === "On deck") statusClass = "status-on-deck";
          else if (match.status === "On field") statusClass = "status-on-field";
          
          htmlContent += `
            <div class="match-card" id="match-${match.label.replace(' ', '-')}">
              <div class="match-header" onclick="toggleMatch(this.parentNode.id)">
                <div class="match-header-left">
                  <div class="alliance-dot ${allianceColor}-alliance"></div>
                  <div class="match-number">${match.label}</div>
                  <div class="match-status ${statusClass}">${match.status}</div>
                </div>
                <div class="match-time">${timeDisplay}</div>
              </div>
              <div class="match-content">
                <div class="match-details">
                  <div class="alliance-section">
                    <div class="alliance-title red-title">
                      Red Alliance
                    </div>
                    <div class="alliance-teams">
                      ${match.redTeams.map(team => 
                        `<div class="team-chip red-team ${team === formattedTeamKey ? 'highlight' : ''}">Team ${team}</div>`
                      ).join('')}
                    </div>
                  </div>
                  <div class="alliance-section">
                    <div class="alliance-title blue-title">
                      Blue Alliance
                    </div>
                    <div class="alliance-teams">
                      ${match.blueTeams.map(team => 
                        `<div class="team-chip blue-team ${team === formattedTeamKey ? 'highlight' : ''}">Team ${team}</div>`
                      ).join('')}
                    </div>
                  </div>
                  <div class="time-section">
                    <div class="time-label">Match Times</div>
                    <div class="time-row">Scheduled: ${new Date(match.times.scheduledStartTime).toLocaleString()}</div>
                    ${match.times.estimatedStartTime ? `<div class="time-row">Estimated: ${new Date(match.times.estimatedStartTime).toLocaleString()}</div>` : ''}
                  </div>
                  ${match.breakAfter ? 
                    `<div class="break-indicator">
                      Break after this match: ${match.breakAfter}
                    </div>` : ''}
                </div>
              </div>
            </div>
          `;
        });
        htmlContent += `</div>`;
      });
      
      // Render completed matches section if available
      if (completedMatches.length > 0) {
        htmlContent += `
          <div class="match-group">
            <div class="match-group-title">Completed Matches</div>
        `;
        const sortedCompletedMatches = completedMatches.sort((a, b) => {
          const aType = a.label.split(' ')[0];
          const bType = b.label.split(' ')[0];
          if (aType !== bType) return aType.localeCompare(bType);
          const aNum = parseInt(a.label.split(' ')[1]);
          const bNum = parseInt(b.label.split(' ')[1]);
          return aNum - bNum;
        });
        sortedCompletedMatches.forEach(match => {
          const isRed = match.redTeams.includes(formattedTeamKey);
          const allianceColor = isRed ? "red" : "blue";
          let timeDisplay = "TBD";
          if (match.times.scheduledStartTime) {
            const matchDate = new Date(match.times.scheduledStartTime);
            timeDisplay = matchDate.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              timeZone: 'Canada/Eastern' // Ensure EST
            });
          }
          let statusClass = "status-default";
          if (match.status === "Now queuing") statusClass = "status-queuing";
          else if (match.status === "On deck") statusClass = "status-on-deck";
          else if (match.status === "On field") statusClass = "status-on-field";
          
          htmlContent += `
            <div class="match-card" id="match-${match.label.replace(' ', '-')}">
              <div class="match-header" onclick="toggleMatch(this.parentNode.id)">
                <div class="match-header-left">
                  <div class="alliance-dot ${allianceColor}-alliance"></div>
                  <div class="match-number">${match.label}</div>
                  <div class="match-status ${statusClass}">${match.status}</div>
                </div>
                <div class="match-time">${timeDisplay}</div>
              </div>
              <div class="match-content">
                <div class="match-details">
                  <div class="alliance-section">
                    <div class="alliance-title red-title">
                      Red Alliance
                    </div>
                    <div class="alliance-teams">
                      ${match.redTeams.map(team => 
                        `<div class="team-chip red-team ${team === formattedTeamKey ? 'highlight' : ''}">Team ${team}</div>`
                      ).join('')}
                    </div>
                  </div>
                  <div class="alliance-section">
                    <div class="alliance-title blue-title">
                      Blue Alliance
                    </div>
                    <div class="alliance-teams">
                      ${match.blueTeams.map(team => 
                        `<div class="team-chip blue-team ${team === formattedTeamKey ? 'highlight' : ''}">Team ${team}</div>`
                      ).join('')}
                    </div>
                  </div>
                  <div class="time-section">
                    <div class="time-label">Match Times</div>
                    <div class="time-row">Scheduled: ${new Date(match.times.scheduledStartTime).toLocaleString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              timeZone: 'Canada/Eastern' // Ensure EST
            })}</div>
                    ${match.times.estimatedStartTime ? `<div class="time-row">Estimated: ${new Date(match.times.estimatedStartTime).toLocaleString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              timeZone: 'Canada/Eastern' // Ensure EST
            })}</div>` : ''}
                  </div>
                  ${match.breakAfter ? 
                    `<div class="break-indicator">
                      Break after this match: ${match.breakAfter}
                    </div>` : ''}
                </div>
              </div>
            </div>
          `;
        });
        htmlContent += `</div>`;
      }
    }
    
    htmlContent += `
        </div>
        <div class="footer">
          <div id="update-status">Data provided by FIRST Nexus API • Last updated: ${new Date().toLocaleString()}</div>
          <div id="hash-display">Hash: N/A</div>
        </div>
      </div>
      <script>
        function toggleMatch(matchId) {
          const card = document.getElementById(matchId);
          card.classList.toggle('active');
          saveOpenMatches();
        }
        
        function saveOpenMatches() {
          const openMatches = Array.from(document.querySelectorAll('.match-card.active')).map(card => card.id);
          localStorage.setItem('openMatches', JSON.stringify(openMatches));
        }
        
        function restoreOpenMatches() {
          const stored = localStorage.getItem('openMatches');
          if (stored) {
            const openMatches = JSON.parse(stored);
            openMatches.forEach(matchId => {
              const card = document.getElementById(matchId);
              if (card) card.classList.add('active');
            });
          }
        }
        
        let currentDataHash = "";
        let checkInterval = 10000; // 10 seconds interval
        let updateTimer;
        
        async function checkForUpdates() {
          const updateStatus = document.getElementById('update-status');
          const hashDisplay = document.getElementById('hash-display');
          try {
            updateStatus.innerHTML = 'Checking for updates...';
            const response = await fetch('/api/data-check?eventKey=' + encodeURIComponent('${eventKey}') + '&lastUpdate=' + currentDataHash);
            const data = await response.json();
            if (data.changed) {
              saveOpenMatches();
              updateStatus.innerHTML = 'New data available! Refreshing...';
              setTimeout(() => window.location.reload(), 500);
            } else {
              currentDataHash = data.hash;
              const shortHash = currentDataHash.substring(0, 8);
              const lastChecked = new Date().toLocaleTimeString();
              updateStatus.innerHTML = 'Data provided by FIRST Nexus API • Last updated: ' + new Date().toLocaleString() + ' • Last checked: ' + lastChecked;
              hashDisplay.innerHTML = 'Hash: ' + shortHash;
              updateTimer = setTimeout(checkForUpdates, checkInterval);
            }
          } catch (error) {
            console.error('Error checking for updates:', error);
            updateStatus.innerHTML = 'Update check failed. Retrying soon...';
            updateTimer = setTimeout(checkForUpdates, checkInterval * 2);
          }
        }
        
        document.addEventListener('DOMContentLoaded', () => {
          restoreOpenMatches();
          setTimeout(checkForUpdates, 1000);
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
              clearTimeout(updateTimer);
              checkForUpdates();
            }
          });
        });
      </script>
    </body>
    </html>
    `;
    
    res.setHeader('Content-Type', 'text/html');
    res.send(htmlContent);
    
  } catch (error) {
    console.error('Error generating full page match data:', error);
    res.status(500).json({ error: 'Failed to generate match data' });
  }
});
// ...existing code...
module.exports = router;
// GET /embed
router.get('/embed', async (req, res) => {
  const { teamKey, eventKey, height = '600' } = req.query;
  
  if (!teamKey) {
    return res.status(400).json({ error: 'Missing teamKey parameter' });
  }

  if (!eventKey) {
    return res.status(400).json({ error: 'Missing eventKey parameter' });
  }
  
  // Format team number (remove "frc" prefix if present)
  const formattedTeamKey = teamKey.startsWith('frc') ? teamKey.substring(3) : teamKey;
  
  // Set display options
  const containerHeight = parseInt(height) > 0 ? parseInt(height) : 600;
  
  try {
    // Load match data
    const eventData = await fetchEventDetails(eventKey);
    if (!eventData) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    // Use these variables from the fetched data
    let matches = [...eventData.matches]; // Create a copy we can modify
    const nowQueuing = eventData.nowQueuing;
    
    // First, sort matches by their sequence
    matches.sort((a, b) => {
      // First sort by match type (Qualification, Playoff, etc.)
      const aType = a.label.split(' ')[0];
      const bType = b.label.split(' ')[0];
      
      if (aType !== bType) return aType.localeCompare(bType);
      
      // Then sort by match number
      const aNum = parseInt(a.label.split(' ')[1]);
      const bNum = parseInt(b.label.split(' ')[1]);
      return aNum - bNum;
    });
    
    // Apply the same auto-completion logic we have in the data-check endpoint
    for (let i = 0; i < matches.length - 1; i++) {
      if (matches[i].status === "On field") {
        for (let j = i + 1; j < matches.length; j++) {
          const laterMatchStatus = matches[j].status;
          
          if (laterMatchStatus === "On field") {
              
            // Mark the earlier match as completed
            matches[i].status = "Completed";
            break;
          }
        }
      }
    }
    
    // Filter matches for the requested team using the modified matches
    const teamMatches = matches.filter(match => 
      Array.isArray(match.redTeams) && match.redTeams.includes(formattedTeamKey) || 
      Array.isArray(match.blueTeams) && match.blueTeams.includes(formattedTeamKey)
    );
    
    // Group matches by type (Practice, Qualification, etc.) and separate completed matches
    const matchGroups = {};
    const completedMatches = []; // New array to store all completed matches

    teamMatches.forEach(match => {
      // If the match is completed, add to completed section
      if (match.status === "Completed") {
        completedMatches.push(match);
      } else {
        // Otherwise add to regular match groups
        const matchType = match.label.split(' ')[0]; // "Qualification", "Practice", etc.
        if (!matchGroups[matchType]) {
          matchGroups[matchType] = [];
        }
        matchGroups[matchType].push(match);
      }
    });
    
    // HTML generation - first show all active/upcoming matches by group
    let htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Team ${formattedTeamKey} Matches</title>
      <style>
        body {
          font-family: 'Roboto', 'Segoe UI', sans-serif;
          background-color: #0a0a0a;
          color: #e0e0e0;
          margin: 0;
          padding: 0;
        }
        .container {
          width: 100%;
          margin: 0 auto;
          padding: 0px;
          height: 100%;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
        }
        .header {
          background: linear-gradient(135deg, #8B0000, #660000);
          color: white;
          padding: 18px 20px;
          border-radius: 10px 10px 0 0;
          text-align: center;
          font-weight: bold;
          font-size: 1.3em;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        .event-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 15px;
          background-color: #1a1a1a;
          border-bottom: 1px solid #333;
          font-size: 0.9em;
        }
        .now-queuing {
          font-weight: bold;
          color: #ff9800;
        }
        .content {
          flex: 1;
          overflow-y: auto;
          padding: 10px 0;
          scrollbar-width: thin;
          scrollbar-color: #444 #1a1a1a;
        }
        .content::-webkit-scrollbar {
          width: 8px;
        }
        .content::-webkit-scrollbar-track {
          background: #1a1a1a;
        }
        .content::-webkit-scrollbar-thumb {
          background-color: #444;
          border-radius: 4px;
        }
        .match-group {
          margin-bottom: 25px;
        }
        .match-group-title {
          font-size: 1.1em;
          font-weight: bold;
          color: #4fc3f7;
          padding: 10px 5px;
          margin-bottom: 10px;
          border-bottom: 1px solid #333;
        }
        .match-card {
          background-color: #1d1d1d;
          border-radius: 8px;
          margin-bottom: 12px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          transition: all 0.3s ease;
        }
        .match-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 3px 6px rgba(0,0,0,0.3);
        }
        .match-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 15px;
          cursor: pointer;
          user-select: none;
          transition: background-color 0.2s;
          flex-wrap: wrap;
        }
        .match-header:hover {
          background-color: #252525;
        }
        .match-header-left {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .alliance-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          display: inline-block;
        }
        .red-alliance {
          background-color: #f44336;
        }
        .blue-alliance {
          background-color: #2196f3;
        }
        .match-number {
          font-weight: bold;
          font-size: 1.1em;
        }
        .match-status {
          font-size: 0.8em;
          padding: 3px 8px;
          border-radius: 12px;
          margin-left: 10px;
          font-weight: 500;
          flex-wrap: nowrap;
        }
        .status-default {
          background-color: #424242;
        }
        .status-queuing {
          background-color: #ff9800;
          color: #000;
        }
        .status-on-deck {
          background-color: #ffc107;
          color: #000;
        }
        .status-on-field {
          background-color: #8bc34a;
          color: #000;
        }
        .match-time {
          font-size: 0.9em;
          color: #bbb;
          margin-top: 5px;
        }
        .match-content {
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.3s ease-out;
          background-color: #252525;
        }
        .match-card.active .match-content {
          max-height: 500px;
        }
        .match-details {
          padding: 15px;
          border-top: 1px solid #333;
        }
        .alliance-section {
          margin-bottom: 15px;
        }
        .alliance-title {
          font-weight: bold;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
        }
        .red-title {
          color: #f44336;
        }
        .blue-title {
          color: #2196f3;
        }
        .alliance-teams {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .team-chip {
          display: inline-flex;
          align-items: center;
          background-color: #333;
          padding: 6px 12px;
          border-radius: 16px;
          font-size: 0.9em;
          border-left: 3px solid transparent;
        }
        .team-chip.highlight {
          background-color: #01579b;
          font-weight: bold;
        }
        .red-team {
          border-color: #f44336;
        }
        .blue-team {
          border-color: #2196f3;
        }
        .time-section {
          margin-top: 15px;
          font-size: 0.85em;
          color: #aaa;
        }
        .time-label {
          font-weight: bold;
          color: #bbb;
          margin-bottom: 5px;
        }
        .time-row {
          margin-bottom: 5px;
        }
        .break-indicator {
          margin-top: 10px;
          padding: 8px;
          background-color: rgba(255, 193, 7, 0.1);
          border-left: 3px solid #ffc107;
          font-style: italic;
          color: #ffc107;
          border-radius: 4px;
        }
        .footer {
          font-size: 0.8em;
          color: #777;
          text-align: center;
          padding: 12px;
          background-color: #1a1a1a;
          border-radius: 0 0 10px 10px;
          border-top: 1px solid #333;
        }
        .no-matches {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
          text-align: center;
          color: #888;
          font-size: 1.1em;
        }
        .no-matches svg {
          margin-bottom: 15px;
          color: #555;
        }
        #update-status {
          font-size: 0.8em;
          color: #777;
          text-align: center;
          transition: color 0.3s ease;
        }
        #update-status:contains('Checking') {
          color: #ffc107;
        }
        #update-status:contains('Refreshing') {
          color: #4caf50;
        }
        .completed-group {
          margin-top: 20px;
          border-top: 1px dashed #444;
          padding-top: 20px;
        }

        .completed-group .match-group-title {
          color: #9e9e9e;
        }

        .completed-group .match-card {
          opacity: 0.8;
        }
      @media (max-width: 600px) {
        .match-header {
          flex-direction: column; /* Stack items vertically */
          align-items: flex-start; /* Align items to the left */
        }

        .match-header-left {
          justify-content: space-between;
          width: 100%; /* Ensure it spans the full width */
        }

        .match-time {
          margin-top: 5px; /* Add spacing between status and time */
          align-self: flex-end; /* Align time to the right */
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          Team ${formattedTeamKey} Matches at ${eventKey}
        </div>
        <div class="event-info">
          <span>Event: ${eventKey}</span>
          <span class="now-queuing">Now Queuing: ${nowQueuing || 'N/A'}</span>
        </div>
        <div class="content">
    `;
    
    if (Object.keys(matchGroups).length === 0 && completedMatches.length === 0) {
      htmlContent += `
        <div class="no-matches">
          <svg width="50" height="50" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M8 15C8.91221 16.2144 10.3645 17 12.0004 17C13.6362 17 15.0885 16.2144 16.0007 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M9 10C9 10.5523 8.55228 11 8 11C7.44772 11 7 10.5523 7 10C7 9.44772 7.44772 9 8 9C8.55228 9 9 9.44772 9 10Z" fill="currentColor"/>
            <path d="M17 10C17 10.5523 16.5523 11 16 11C15.4477 11 15 10.5523 15 10C15 9.44772 15.4477 9 16 9C16.5523 9 17 9.44772 17 10Z" fill="currentColor"/>
          </svg>
          <p>No matches found for team ${formattedTeamKey}</p>
        </div>`;
    } else {
      // Process each match group (Qualification, Practice, etc.)
      Object.keys(matchGroups).forEach(groupType => {
        htmlContent += `
          <div class="match-group">
            <div class="match-group-title">${groupType} Matches</div>
        `;
        
        // Sort matches by number
        const sortedMatches = matchGroups[groupType].sort((a, b) => {
          const aNum = parseInt(a.label.split(' ')[1]);
          const bNum = parseInt(b.label.split(' ')[1]);
          return aNum - bNum;
        });
        
        // Process each match
        sortedMatches.forEach(match => {
          // Render match card HTML
// Determine if team is on red or blue alliance
          const isRed = match.redTeams.includes(formattedTeamKey);
          const allianceColor = isRed ? "red" : "blue";
          
          // Format match time
          let timeDisplay = "TBD";
          if (match.times.scheduledStartTime) {
            const matchDate = new Date(match.times.scheduledStartTime);
            timeDisplay = matchDate.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              timeZone: 'Canada/Eastern' // Ensure EST
            });
          }
          
          // Status display class
          let statusClass = "status-default";
          if (match.status === "Now queuing") statusClass = "status-queuing";
          else if (match.status === "On deck") statusClass = "status-on-deck";
          else if (match.status === "On field") statusClass = "status-on-field";
          
          htmlContent += `
            <div class="match-card" id="match-${match.label.replace(' ', '-')}">
              <div class="match-header" onclick="toggleMatch(this.parentNode.id)">
                <div class="match-header-left">
                  <div class="alliance-dot ${allianceColor}-alliance"></div>
                  <div class="match-number">${match.label}</div>
                  <div class="match-status ${statusClass}">${match.status}</div>
                </div>
                <div class="match-time">${timeDisplay}</div>
              </div>
              <div class="match-content">
                <div class="match-details">
                  <div class="alliance-section">
                    <div class="alliance-title red-title">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right: 5px;">
                        <path d="M2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="#f44336" stroke-width="2"/>
                        <path d="M2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12Z" stroke="#f44336" stroke-width="2"/>
                      </svg>
                      Red Alliance
                    </div>
                    <div class="alliance-teams">
                      ${match.redTeams.map(team => 
                        `<div class="team-chip red-team ${team === formattedTeamKey ? 'highlight' : ''}">Team ${team}</div>`
                      ).join('')}
                    </div>
                  </div>
                  <div class="alliance-section">
                    <div class="alliance-title blue-title">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right: 5px;">
                        <path d="M2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12Z" fill="#2196f3" opacity="0.2"/>
                        <path d="M2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12Z" stroke="#2196f3" stroke-width="2"/>
                      </svg>
                      Blue Alliance
                    </div>
                    <div class="alliance-teams">
                      ${match.blueTeams.map(team => 
                        `<div class="team-chip blue-team ${team === formattedTeamKey ? 'highlight' : ''}">Team ${team}</div>`
                      ).join('')}
                    </div>
                  </div>
                  <div class="time-section">
                    <div class="time-label">Match Times</div>
                    <div class="time-row">Scheduled: ${new Date(match.times.scheduledStartTime).toLocaleString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              timeZone: 'Canada/Eastern' // Ensure EST
            })}</div>
                    ${match.times.estimatedStartTime ? `<div class="time-row">Estimated: ${new Date(match.times.estimatedStartTime).toLocaleString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              timeZone: 'Canada/Eastern' // Ensure EST
            })}</div>` : ''}
                  </div>
                  ${match.breakAfter ? 
                    `<div class="break-indicator">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right: 5px; vertical-align: text-bottom;">
                        <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="#ffc107" stroke-width="2"/>
                        <path d="M12 6V12L16 14" stroke="#ffc107" stroke-width="2" stroke-linecap="round"/>
                      </svg>
                      Break after this match: ${match.breakAfter}
                    </div>` : ''}
                </div>
              </div>
            </div>
          `;
        });
        htmlContent += `</div>`;
      });
      
      // After all regular match groups, add completed matches section if any exist
      if (completedMatches.length > 0) {
        htmlContent += `
          <div class="match-group completed-group">
            <div class="match-group-title">Completed Matches</div>
        `;
        
        // Sort completed matches by type and number
        const sortedCompletedMatches = completedMatches.sort((a, b) => {
          // First sort by match type (Qualification, Playoff, etc.)
          const aType = a.label.split(' ')[0];
          const bType = b.label.split(' ')[0];
          
          if (aType !== bType) return aType.localeCompare(bType);
          
          // Then sort by match number
          const aNum = parseInt(a.label.split(' ')[1]);
          const bNum = parseInt(b.label.split(' ')[1]);
          return aNum - bNum;
        });
        
        // Process each completed match
        sortedCompletedMatches.forEach(match => {
          // Render match card HTML - identical to the code above
          // (copy the match rendering code here)
          // Determine if team is on red or blue alliance
          const isRed = match.redTeams.includes(formattedTeamKey);
          const allianceColor = isRed ? "red" : "blue";
          
          // Format match time
          let timeDisplay = "TBD";
          if (match.times.scheduledStartTime) {
            const matchDate = new Date(match.times.scheduledStartTime);
            timeDisplay = matchDate.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              timeZone: 'Canada/Eastern' // Ensure EST
            });
          }
          
          // Status display class
          let statusClass = "status-default";
          if (match.status === "Now queuing") statusClass = "status-queuing";
          else if (match.status === "On deck") statusClass = "status-on-deck";
          else if (match.status === "On field") statusClass = "status-on-field";
          
          htmlContent += `
            <div class="match-card" id="match-${match.label.replace(' ', '-')}">
              <div class="match-header" onclick="toggleMatch(this.parentNode.id)">
                <div class="match-header-left">
                  <div class="alliance-dot ${allianceColor}-alliance"></div>
                  <div class="match-number">${match.label}</div>
                  <div class="match-status ${statusClass}">${match.status}</div>
                </div>
                <div class="match-time">${timeDisplay}</div>
              </div>
              <div class="match-content">
                <div class="match-details">
                  <div class="alliance-section">
                    <div class="alliance-title red-title">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right: 5px;">
                        <path d="M2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="#f44336" stroke-width="2"/>
                        <path d="M2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12Z" stroke="#f44336" stroke-width="2"/>
                      </svg>
                      Red Alliance
                    </div>
                    <div class="alliance-teams">
                      ${match.redTeams.map(team => 
                        `<div class="team-chip red-team ${team === formattedTeamKey ? 'highlight' : ''}">Team ${team}</div>`
                      ).join('')}
                    </div>
                  </div>
                  <div class="alliance-section">
                    <div class="alliance-title blue-title">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right: 5px;">
                        <path d="M2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12Z" fill="#2196f3" opacity="0.2"/>
                        <path d="M2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12Z" stroke="#2196f3" stroke-width="2"/>
                      </svg>
                      Blue Alliance
                    </div>
                    <div class="alliance-teams">
                      ${match.blueTeams.map(team => 
                        `<div class="team-chip blue-team ${team === formattedTeamKey ? 'highlight' : ''}">Team ${team}</div>`
                      ).join('')}
                    </div>
                  </div>
                  <div class="time-section">
                    <div class="time-label">Match Times</div>
                    <div class="time-row">Scheduled: ${new Date(match.times.scheduledStartTime).toLocaleString()}</div>
                    ${match.times.estimatedStartTime ? `<div class="time-row">Estimated: ${new Date(match.times.estimatedStartTime).toLocaleString()}</div>` : ''}
                  </div>
                  ${match.breakAfter ? 
                    `<div class="break-indicator">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right: 5px; vertical-align: text-bottom;">
                        <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="#ffc107" stroke-width="2"/>
                        <path d="M12 6V12L16 14" stroke="#ffc107" stroke-width="2" stroke-linecap="round"/>
                      </svg>
                      Break after this match: ${match.breakAfter}
                    </div>` : ''}
                </div>
              </div>
            </div>
          `;
        });
        htmlContent += `</div>`;
      }
    }
    
    htmlContent += `
        </div>
        <div class="footer">
          <div id="update-status">Data provided by FIRST Nexus API • Last updated: ${new Date().toLocaleString()}</div>
          <div id="hash-display">Hash: N/A</div>
        </div>
      </div>
      <script>
        // Track the current data state
        let currentDataHash = "";
        let checkInterval = 10000; // Check every 10 seconds
        let updateTimer;
        let eventKey = "${eventKey}"; // Get from server-side rendering
        
        function toggleMatch(matchId) {
          const card = document.getElementById(matchId);
          // Save state before toggling
          card.classList.toggle('active');
          saveOpenMatches();
        }
        
        function saveOpenMatches() {
          const openMatches = Array.from(document.querySelectorAll('.match-card.active')).map(card => card.id);
          localStorage.setItem('openMatches', JSON.stringify(openMatches));
        }
        
        function restoreOpenMatches() {
          const stored = localStorage.getItem('openMatches');
          if (stored) {
            const openMatches = JSON.parse(stored);
            openMatches.forEach(matchId => {
              const card = document.getElementById(matchId);
              if (card) {
                card.classList.add('active');
              }
            });
          }
        }
        
        // Function to check for data updates
        async function checkForUpdates() {
          const updateStatus = document.getElementById('update-status');
          const hashDisplay = document.getElementById('hash-display');
          
          try {
            updateStatus.innerHTML = 'Checking for updates...';
            
            const response = await fetch('/api/data-check?eventKey=' + eventKey + '&lastUpdate=' + currentDataHash);
            const data = await response.json();
            
            if (data.changed) {
              // Save open match IDs before refresh
              saveOpenMatches();
              
              updateStatus.innerHTML = 'New data available! Refreshing...';
              setTimeout(() => window.location.reload(), 500);
            } else {
              currentDataHash = data.hash; // Update hash only if no changes
              const shortHash = currentDataHash.substring(0, 8); // Show first 8 characters
              const lastChecked = new Date().toLocaleTimeString();
              updateStatus.innerHTML = 'Data provided by FIRST Nexus API • Last updated: ' + new Date().toLocaleString() + ' • Last checked: ' + lastChecked;
              hashDisplay.innerHTML = 'Hash: ' + shortHash;
    
              // Schedule next check
              updateTimer = setTimeout(checkForUpdates, checkInterval);
            }
          } catch (error) {
            console.error('Error checking for updates:', error);
            updateStatus.innerHTML = 'Update check failed. Retrying soon...';
            updateTimer = setTimeout(checkForUpdates, checkInterval * 2);
          }
        }
        
        // Start the update check process and restore open matches
        document.addEventListener('DOMContentLoaded', function() {
          // Restore open match cards
          restoreOpenMatches();
          
          // Initial check after a short delay
          setTimeout(checkForUpdates, 1000);
          
          // Also check when the page becomes visible again
          document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'visible') {
              // Clear any pending check and do an immediate check
              clearTimeout(updateTimer);
              checkForUpdates();
            }
          });
        });
      </script>
    </body>
    </html>
    `;
    
    // Set content type to HTML and send the response
    res.setHeader('Content-Type', 'text/html');
    res.send(htmlContent);
  } catch (error) {
    console.error('Error generating match data:', error);
    res.status(500).json({ error: 'Failed to generate match data' });
  }
});

// Add a health endpoint for Docker healthchecks
router.get('/api/health', (req, res) => {
  res.status(200).send('OK');
});

// Add a data-check endpoint to detect changes
router.get('/api/data-check', async (req, res) => {
  let { eventKey, lastUpdate } = req.query; // lastUpdate comes as an empty string initially

  try {
    const eventData = await fetchEventDetails(eventKey);
    if (!eventData) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Create a copy of matches for modification
    const modifiedMatches = [...eventData.matches];

    // Sort matches by their sequence
    modifiedMatches.sort((a, b) => {
      const aType = a.label.split(' ')[0];
      const bType = b.label.split(' ')[0];
      if (aType !== bType) return aType.localeCompare(bType);

      const aNum = parseInt(a.label.split(' ')[1]);
      const bNum = parseInt(b.label.split(' ')[1]);
      return aNum - bNum;
    });

    // Mark earlier matches as completed if a later match is "On field"
    for (let i = 0; i < modifiedMatches.length - 1; i++) {
      if (modifiedMatches[i].status === "On field") {
        for (let j = i + 1; j < modifiedMatches.length; j++) {
          if (modifiedMatches[j].status === "On field") {
            modifiedMatches[i].status = "Completed";
            break;
          }
        }
      }
    }

    // Create a consistent hash of important data
    const dataHash = JSON.stringify({
      nowQueuing: eventData.nowQueuing || null,
      matchStatuses: modifiedMatches.map(m => ({
        id: m.label.replace(/\s+/g, '-'),
        status: m.status.trim()
      })).sort((a, b) => a.id.localeCompare(b.id))
    });

    const currentHash = require('crypto')
      .createHash('md5')
      .update(dataHash)
      .digest('hex');

    // If lastUpdate is empty, assume it's the initial load and don't trigger a refresh
    if (!lastUpdate) {
      lastUpdate = currentHash;
    }

    const hasChanged = lastUpdate !== currentHash;

    res.json({
      changed: hasChanged,
      hash: currentHash,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error checking for data updates:', error);
    res.status(500).json({ error: 'Failed to check for updates' });
  }
});

module.exports = router;
