const path = require('path');
const { app, Tray, Menu, MenuItem, shell, Notification } = require('electron');
const fetch = require('node-fetch');
const _ = require('lodash');
const moment = require('moment');
const settings = require('electron-settings');

let teamData = require('./teams.json');

let tray = null;
let menu = null;
let menuIsOpen = false;
let tomorrowData = null;
let todayData = null;
let currentMatches = [];
let currentMatchesEvents = [];
let supportedEvents = ['goal', 'goal-penalty'];
let isInitialFetch = true;

app.on('ready', () => {
    if (app.dock) {
        app.dock.hide();
    }

    tray = new Tray(path.join(app.getAppPath(), 'icon/iconTemplate.png'));
    createMenu();
    menu.append(new MenuItem({ label: 'Quit', role: 'quit' }));
    tray.setContextMenu(menu);

    setDefaultSettings();

    fetchTomorrowData();
    fetchTodayData();
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

function fetchTomorrowData() {
    fetch('https://world-cup-json.herokuapp.com/matches/tomorrow')
        .then(resp => resp.json())
        .then(json => {
            tomorrowData = json;
            setMenu();

            setTimeout(fetchTomorrowData, 60 * 60 * 1000); // Update every hour
        }).catch(function (err) {
            console.error(err);

            setTimeout(fetchTomorrowData, 60 * 1000); // Retry in a minute
        });
}

function fetchTodayData() {
    fetch('https://world-cup-json.herokuapp.com/matches/today')
        .then(resp => resp.json())
        .then(json => {
            todayData = json;
            setMenu();
            isInitialFetch = false;
        }).catch(function (err) {
            console.error(err);
        });
}

function createMenu() {
    menu = new Menu();

    menu.on('menu-will-show', () => {
        menuIsOpen = true;
    });
    menu.on('menu-will-close', () => {
        menuIsOpen = false;
    });
}

function setMenu() {
    if (menuIsOpen) {
        return;
    }

    createMenu();

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

        return;
    }

    todayData = sortMatchData(todayData);

    let inProgressMatches = _.filter(todayData, { status: 'in progress' });
    let futureMatches     = _.filter(todayData, { status: 'future' });

    if (inProgressMatches.length) {
        setTray(inProgressMatches);

        _.forEach(inProgressMatches, (match, key) => {
            if (!currentMatches ||
                !_.every(currentMatches, ['fifa_id', match.fifa_id])) {
                currentMatches.push(match);
                currentMatchesEvents[match.fifa_id] = [];
            }

            if ( inProgressMatches.length > 1 && key === 0 ) {
                menu.append(new MenuItem({type: 'separator'}));
            }

            renderMatchEvents(match);
            handleMatchEvents(match);
        });
    } else if (futureMatches.length) {
        let nextMatches = getFirstMatches(futureMatches);
        setTray(nextMatches);
    }

    if (!inProgressMatches.length) {
        currentMatches = null;
        currentMatchesEvents = [];
    }

    menu.append(new MenuItem({ label: 'Today\'s Matches', enabled: false }));

    _.forEach(todayData, (match) => {
        renderMatchTitle(match)
    });
}

function renderMatchTitle(match) {
    menu.append(new MenuItem({
        label: getMatchTitle(match), click() {
            shell.openExternal('https://www.fifa.com/worldcup/matches/match/' + match.fifa_id);
        },
    }));
}

function getFirstMatches(matches) {
    let firstMatch = _.head(matches);
    return _.filter(matches, ['datetime', firstMatch.datetime]);
}

function setTray(matches) {
    let titles = [];
    _.forEach(matches, (match) => {
        titles.push(getMatchTitle(match, 'code'));
    });

    let title = titles.join(' / ');

    tray.setTitle(title);
    tray.setToolTip('Next match: ' + title);
}

function renderMatchEvents(match) {
    let events = combineTeamEvents(match.home_team_events, match.away_team_events);
    if (events.length) {
        _.forEach(events, (event) => {
            let description = getEventDescription(event, false);
            let prefix = match[event.team].code;
            if (isShowingFlags()) {
                prefix = getCountryEmoji(prefix);
            }
            menu.append(new MenuItem({label: prefix + ' ' + description}));
        });

        menu.append(new MenuItem({ type: 'separator' }));
    }
}

function renderTomorrowMatches() {
    if (!tomorrowData || !tomorrowData.length) {
        return;
    }

    tomorrowData = sortMatchData(tomorrowData);

    menu.append(new MenuItem({type: 'separator'}));
    menu.append(new MenuItem({label: 'Tomorrow\'s Matches', enabled: false}));
    _.forEach(tomorrowData, (match) => {
        renderMatchTitle(match);
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
    if (currentMatches[match.fifa_id] === undefined) {
        return;
    }

    let newEvents = getNewEvents(match);
    if (_.isEmpty(newEvents)) {
        return;
    }
    if (isInitialFetch) {
        return;
    }

    _.forEach(newEvents, (event) => {
        eventNotification(event, match);
    }, match);
}

function getNewEvents(match) {
    let newHomeEvents = _.reject(match.home_team_events, (event) => _.includes(currentMatchesEvents[match.fifa_id], event.id));
    let newAwayEvents = _.reject(match.away_team_events, (event) => _.includes(currentMatchesEvents[match.fifa_id], event.id));

    if (_.isEmpty(newHomeEvents) && _.isEmpty(newAwayEvents)) {
        return [];
    }

    return combineTeamEvents(newHomeEvents, newAwayEvents);
}

function combineTeamEvents(homeEvents, awayEvents) {
    homeEvents.map((event) => {
        currentMatchesEvents[match.fifa_id].push(event.id);
        event.team = 'home_team';
        return event;
    });
    awayEvents.map((event) => {
        currentMatchesEvents[match.fifa_id].push(event.id);
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

function getEventDescription(event, fullname = true) {
    let time = ' (' + event.time;
    if (event.type_of_event === 'goal-penalty') {
        time += ' pen';
    }
    time += ')';

    let player = event.player;
    if (!fullname) {
        player = player.split(' ').slice(-1).join(' ');
    }

    return _.startCase(_.toLower(player)) + time;
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