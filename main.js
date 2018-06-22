const path = require('path');
const { app, Tray, Menu, MenuItem, shell, Notification } = require('electron');
const fetch = require('node-fetch');
const _ = require('lodash');
const moment = require('moment');
const settings = require('electron-settings');

let teamData = require('./teams.json');

let tray = null;
let menu = null;
let tomorrowData = null;
let todayData = null;
let currentMatch = null;
let currentMatchEvents = [];
let supportedEvents = ['goal', 'goal-penalty'];


app.on('ready', () => {
    if (app.dock) {
        app.dock.hide();
    }

    tray = new Tray(path.join(app.getAppPath(), 'icon/iconTemplate.png'));
    menu = new Menu();
    menu.append(new MenuItem({ label: 'Quit', role: 'quit' }));
    tray.setContextMenu(menu);

    setDefaultSettings();

    initMenu();
    setInterval(fetchTodayData, 60 * 1000);
});

function setDefaultSettings() {
    if (!settings.has('show_flags')) {
        settings.set('show_flags', true);
    }

    if (!settings.has('notifications')) {
        settings.set('notifications', true);
    }
}

app.on('window-all-closed', () => {
    // nothing
});

async function initMenu () {
    (async () => {
        try {
            let resp = await fetch('https://world-cup-json.herokuapp.com/matches/tomorrow');
            tomorrowData = await resp.json();
            fetchTodayData();
        } catch (error) {
            console.log('error: ', error);
        }
    })();
}

function fetchTodayData() {
    fetch('https://world-cup-json.herokuapp.com/matches/today')
        .then(resp => resp.json())
        .then(json => {
            todayData = json;
            setMenu();
        }).catch(function (err) {
            console.error(err);
        })
}

function setMenu() {
    menu = new Menu();

    renderTodayMatches();
    renderTomorrowMatches();

    setMenuSettings();
    setMenuOther();

    tray.setContextMenu(menu);
}

function renderTodayMatches() {
    if (!todayData || !todayData.length) {
        let title = 'No matches today';
        tray.setTitle(title);
        tray.setToolTip(title);
        menu.append(new MenuItem({label: title, enabled: false}));
    }

    todayData = sortMatchData(todayData);

    inProgressMatches = _.filter(todayData, { status: 'in progress' });
    futureMatches = _.filter(todayData, { status: 'future' });

    if (inProgressMatches.length) {
        var match = _.head(inProgressMatches);
        if (!currentMatch || currentMatch.fifa_id != match.fifa_id) {
            currentMatch = match;
            currentMatchEvents = [];
        }
        var title = getMatchTitle(match, 'code');
        tray.setTitle(title);
        tray.setToolTip(title);

        renderMatchEvents(match);
        menu.append(new MenuItem({ type: 'separator' }));

        handleMatchEvents(match);
    } else if (futureMatches.length) {
        var match = _.head(futureMatches);
        var title = getMatchTitle(match, 'code');
        tray.setTitle(title);
        tray.setToolTip('Next match: ' + title);
    }

    if (!inProgressMatches.length) {
        currentMatch = null;
        currentMatchEvents = [];
    }

    menu.append(new MenuItem({ label: 'Today\'s Matches', enabled: false }));

    _.forEach(todayData, (match) => {
        menu.append(new MenuItem({ label: getMatchTitle(match), click() {
                shell.openExternal('https://www.fifa.com/worldcup/matches/match/' + match.fifa_id);
            } }));
    });
}

function renderMatchEvents(match) {
    let events = combineTeamEvents(match.home_team_events, match.away_team_events);
    _.forEach(events, (event) => {
        menu.append(new MenuItem({label: getEventDescription(event)}));
    });
}

function renderTomorrowMatches() {
    if (!tomorrowData || !tomorrowData.length) {
        return;
    }
    tomorrowData = sortMatchData(tomorrowData);

    menu.append(new MenuItem({type: 'separator'}));
    menu.append(new MenuItem({label: 'Tomorrow\'s Matches', enabled: false}));
    _.forEach(tomorrowData, (match) => {
        menu.append(new MenuItem({
            label: getMatchTitle(match), click() {
                shell.openExternal('https://www.fifa.com/worldcup/matches/match/' +
                                   match.fifa_id);
            },
        }));
    });
}

function setMenuSettings() {
    menu.append(new MenuItem({type: 'separator'}));
    menu.append(new MenuItem({
        label: 'Notifications',
        type: 'checkbox',
        checked: isShowingNotifications(),
        click(menuItem) {
            settings.set('notifications', menuItem.checked);
        },
    }));
    menu.append(new MenuItem({
        label: 'Show Flags',
        type: 'checkbox',
        checked: isShowingFlags(),
        click(menuItem) {
            settings.set('show_flags', menuItem.checked);
            setMenu();
        },
    }));
}

function isShowingNotifications() {
    return settings.get('notifications');
}

function isShowingFlags() {
    return settings.get('show_flags');
}

function setMenuOther() {
    menu.append(new MenuItem({ type: 'separator' }));
    menu.append(new MenuItem({ label: 'About', role: 'about' }));
    menu.append(new MenuItem({ label: 'Quit', role: 'quit' }));
}

function sortMatchData(data) {
    return _.sortBy(data, (match) => moment(match.datetime));
}

function getMatchTitle(match, label = 'country', displayTime = true, useEmojis = true) {
    let homeTeam = match.home_team[label];
    let awayTeam = match.away_team[label];

    if (isShowingFlags() && useEmojis) {
        homeTeam += ' ' + getCountryEmoji(match.home_team['code']);
        awayTeam = getCountryEmoji(match.away_team['code']) + ' ' + awayTeam;
    }

    if (match.status != 'future') {
        return homeTeam + ' ' + match.home_team.goals + ' - ' + match.away_team.goals + ' ' + awayTeam + ' (' + formatMatchTime(match.time) + ')';
    }

    let title = homeTeam + ' - ' + awayTeam;
    if (displayTime) {
        title += ' (' + formatDatetime(match.datetime) + ')';
    }

    return title;
}

function handleMatchEvents(match) {
    if (!isShowingNotifications()) {
        return;
    }
    if (!currentMatch) {
        return;
    }

    let newEvents = getNewEvents(match);
    if (_.isEmpty(newEvents)) {
        return;
    }

    _.forEach(newEvents, (event) => {
        eventNotification(event, match);
    }, match);
}

function getNewEvents(match) {
    let newHomeEvents = _.reject(match.home_team_events, (event) => _.includes(currentMatchEvents, event.id));
    let newAwayEvents = _.reject(match.away_team_events, (event) => _.includes(currentMatchEvents, event.id));

    if (_.isEmpty(newHomeEvents) && _.isEmpty(newAwayEvents)) {
        return [];
    }

    return combineTeamEvents(newHomeEvents, newAwayEvents );
}

function combineTeamEvents(homeEvents, awayEvents) {
    homeEvents.map((event) => {
        currentMatchEvents.push(event.id);
        event.team = 'home_team';
        return event;
    });
    awayEvents.map((event) => {
        currentMatchEvents.push(event.id);
        event.team = 'away_team';
        return event;
    });

    events = homeEvents.concat(awayEvents);
    events = _.sortBy(events, (event) => event.id);

    events = events.filter((event) => {
        return supportedEvents.includes(event.type_of_event);
    });

    return events;
}

function getEventDescription(event) {
    let time = '(' + event.time;
    if (event.type_of_event === 'goal-penalty') {
        time += ' pen';
    }
    time += ')';

    return event.player + time;
}

function eventNotification(event, match) {
    let flag = getCountryEmoji(match[event.team].code);

    let title = flag + ' GOAL! ' + getMatchTitle(match, 'country', false, false);

    let message = getEventDescription(event);

    let notification = new Notification({
        title: title,
        body: message,
        silent: true,
    });
    notification.show();
}

function getCountryEmoji(code) {
    var country = _.find(teamData, function(country) {
        if (country.fifa_code === code) {
            return country;
        }
    });

    return country['emoji'];
}

function formatMatchTime(time) {
    if (time == 'full-time') {
        return 'FT';
    }
    if (time == 'half-time') {
        return 'HT';
    }

    return time;
}

function formatDatetime(datetime) {
    return moment(datetime).format('h:mm a');
}