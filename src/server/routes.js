const express = require('express');
const router = express.Router();
const { fetchEventDetails } = require('./api');
const crypto = require('crypto');

// GET /api/TBA-matches/test - Returns raw event data
// DO NOT UNCOMMENT THIS UNLESS YOU KNOW WHAT YOU'RE DOING AS THIS WILL ALLOW OTHERS TO EXPOLIT YOUR API KEY
// router.get('/test', async (req, res) => {
//   const { eventKey } = req.query;
//   const eventDetails = await fetchEventDetails(eventKey);
//   res.send(eventDetails);
// });

// GET / - Full page version of team match display
router.get('/', async (req, res) => {
  const { teamKey, eventKey } = req.query;
  
  // If teamKey or eventKey are not provided, render an input form
  if (!teamKey || !eventKey) {
    return res.render('pages/home');
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
    
    // Render the matches page with the match data
    res.render('pages/matches', {
      teamKey,
      formattedTeamKey,
      eventKey,
      matchGroups,
      completedMatches,
      nowQueuing
    });
    
  } catch (error) {
    console.error('Error generating full page match data:', error);
    res.status(500).json({ error: 'Failed to generate match data' });
  }
});

// GET /embed - Embeddable version of team match display
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
    
    // Apply the same auto-completion logic
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
    
    // Filter matches for the requested team using the modified matches
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
    
    // Render the embed page with the match data
    res.render('pages/embed', {
      teamKey,
      formattedTeamKey,
      eventKey,
      matchGroups,
      completedMatches,
      nowQueuing,
      containerHeight
    });
    
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
  let { eventKey, lastUpdate } = req.query;

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

    const currentHash = crypto
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
