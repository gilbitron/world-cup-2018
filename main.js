const path = require('path');
const { app, Tray, Menu, MenuItem, shell } = require('electron');
const fetch = require('node-fetch');
const _ = require('lodash');
const moment = require('moment');
const openAboutWindow = require('about-window').default;

var teamData = require('./teams.json');

let tray = null;
let menu = null;
let tomorrowData = null;
let todayData = null;

app.on('ready', () => {
    if (app.dock) {
        app.dock.hide();
    }

    tray = new Tray(path.join(app.getAppPath(), 'icon/iconTemplate.png'));
    menu = new Menu();
    menu.append(new MenuItem({ label: 'Quit', role: 'quit' }));
    tray.setContextMenu(menu);

    fetchTomorrowData();
    fetchTodayData();
    setInterval(fetchTodayData, 60 * 1000);
});

app.on('window-all-closed', () => {
    // nothing
});

function fetchTomorrowData () {
    fetch('https://world-cup-json.herokuapp.com/matches/tomorrow')
        .then(resp => resp.json())
        .then(json => {
            tomorrowData = json;
            setMenu();
        }).catch(function (err) {
            console.error(err);
        })
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

    if (todayData && todayData.length) {
        todayData = sortMatchData(todayData);

        inProgressMatches = _.filter(todayData, { status: 'in progress' });
        futureMatches = _.filter(todayData, { status: 'future' });

        if (inProgressMatches.length) {
            var match = _.head(inProgressMatches);
            var title = getMatchTitle(match, 'code');
            tray.setTitle(title);
            tray.setToolTip(title);
            menu.append(new MenuItem({ label: getMatchTitle(match), click() {
                shell.openExternal('https://www.fifa.com/worldcup/matches/match/' + match.fifa_id);
            } }));
            menu.append(new MenuItem({ type: 'separator' }));
        } else if (futureMatches.length) {
            var match = _.head(futureMatches);
            var title = getMatchTitle(match, 'code');
            tray.setTitle(title);
            tray.setToolTip('Next match: ' + title);
        }

        menu.append(new MenuItem({ label: 'Today\'s Matches', enabled: false }));

        _.forEach(todayData, (match) => {
            menu.append(new MenuItem({ label: getMatchTitle(match), click() {
                shell.openExternal('https://www.fifa.com/worldcup/matches/match/' + match.fifa_id);
            } }));
        });
    } else {
        var title = 'No matches today';
        tray.setTitle(title);
        tray.setToolTip(title);
        menu.append(new MenuItem({ label: title, enabled: false }));
    }

    if (tomorrowData && tomorrowData.length) {
        tomorrowData = sortMatchData(tomorrowData);

        menu.append(new MenuItem({ type: 'separator' }));
        menu.append(new MenuItem({ label: 'Tomorrow\'s Matches', enabled: false }));
        _.forEach(tomorrowData, (match) => {
            menu.append(new MenuItem({ label: getMatchTitle(match), click() {
                shell.openExternal('https://www.fifa.com/worldcup/matches/match/' + match.fifa_id);
            } }));
        });
    }

    setMenuOther();

    tray.setContextMenu(menu);
}

function setMenuOther() {
    menu.append(new MenuItem({ type: 'separator' }));
    menu.append(new MenuItem({ label: 'About', click() {
            openAboutWindow({
                icon_path: path.join(app.getAppPath(), 'icon/icon-1024.png'),
                copyright: 'By @gilbitron from Dev7studios'
            });
        } }));
    menu.append(new MenuItem({ label: 'Quit', role: 'quit' }));
}

function sortMatchData(data) {
    return _.sortBy(data, (match) => moment(match.datetime));
}

function getMatchTitle(match, label = 'country') {
    var homeTeam = match.home_team[label];
    var awayTeam = match.away_team[label];

    homeTeam += ' ' + getCountryEmoji(match.home_team['code']);
    awayTeam += ' ' + getCountryEmoji(match.away_team['code']);

    if (match.status != 'future') {
        return homeTeam + ' ' + match.home_team.goals + ' - ' + match.away_team.goals + ' ' + awayTeam + ' (' + formatMatchTime(match.time) + ')';
    }

    return homeTeam + ' - ' + awayTeam + ' (' + formatDatetime(match.datetime) + ')';
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