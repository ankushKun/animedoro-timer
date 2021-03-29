var interval;
let endTime = Date.now() + (40 * 60 * 1000);
let watchingAnime = false;
let animeTime = 1;
let workTime = 2;
let timeMins = workTime;
let paused = false;

const minsCounter = document.querySelector('.minutes');
const secsCounter = document.querySelector('.seconds');
const startButton = document.querySelector('#start-button');
const plus5 = document.querySelector('#plus5');
const pause = document.querySelector('#pause');
const play = document.querySelector('#play');
const nextEventInfo = document.querySelector('.next-event-info')
const animeSessionCounter = document.querySelector('.anime-session-counter')
const studySessionCounter = document.querySelector('.study-session-counter')

const beep = document.querySelector("#notificationSound");

startButton.textContent = "START";
plus5.textContent = "+5";
plus5.style.visibility = 'hidden';
pause.style.visibility = 'hidden';
play.style.visibility = 'hidden';

// get values and initialize if non existent
let animeSessions = localStorage.getItem("animeSessions") ? localStorage.getItem("animeSessions") : 0;
let studySessions = localStorage.getItem("studySessions") ? localStorage.getItem("studySessions") : 0;
localStorage.setItem("animeSessions", animeSessions);
localStorage.setItem("studySessions", studySessions);

function updateSessionCounters() {
    animeSessions = parseInt(localStorage.getItem("animeSessions"));
    animeSessionCounter.textContent = animeSessions + " Anime Sessions";
    studySessions = parseInt(localStorage.getItem("studySessions"));
    studySessionCounter.textContent = studySessions + " Study Sessions";
}
updateSessionCounters();

function addAnimeSession() {
    localStorage.setItem("animeSessions", parseInt(animeSessions) + 1);
    updateSessionCounters();
}
function addStudySession() {
    localStorage.setItem("studySessions", parseInt(studySessions) + 1);
    updateSessionCounters();
}

const startCountdown = function (mins, secs) {
    const now = Date.now();
    endTime = now + (mins * 60 * 1000) + (secs * 1000);
    displayTime(Math.round((endTime - Date.now()) / 1000));
    plus5.style.visibility = 'visible';
    pause.style.visibility = 'visible';
    play.style.visibility = 'hidden';
    paused = false;
    interval = setInterval(() => {
        if (paused) {
            endTime += (100); // keeps adding 100ms because interval is called every 100ms
            return;
        }
        const timeLeft = Math.round((endTime - Date.now()) / 1000);
        if (timeLeft < 0) {
            beep.play();
            if (watchingAnime) {
                // working time starts
                clearInterval(interval);
                nextEventInfo.textContent = "Dont you dare click on next Episode!"
                startButton.textContent = "START";
                plus5.style.visibility = 'hidden';
                timeMins = workTime;
                watchingAnime = false;
                notify("Anime time has ended", "Get back to work\nAND DONT YOU DARE CLICK ON NEXT EPISODE!");
                addAnimeSession();
                return;
            }
            else {
                // anime time starts
                clearInterval(interval);
                timeMins = animeTime;
                nextEventInfo.textContent = "You can watch Anime now"
                plus5.style.visibility = 'hidden';
                startButton.textContent = "START";
                watchingAnime = true;
                notify("You can take a break now", "Go watch that episode!\n");
                addStudySession();
                return;
            }
        }
        displayTime(timeLeft);
    }, 100);// 100ms interval
}

const displayTime = function (seconds) {
    let minutesRemaining = Math.floor(seconds / 60);
    let secondsRemaining = seconds % 60;
    minsCounter.textContent = (minutesRemaining < 10 ? '0' : '') + minutesRemaining;
    secsCounter.textContent = (secondsRemaining < 10 ? '0' : '') + secondsRemaining;
    //console.log(minutesRemaining, secondsRemaining);
}

const add5mins = function () {
    endTime += (5 * 60 * 1000);
    //displayTime(Date.now() - endTime);
    updateEventDetails(endTime);
}

const updateEventDetails = function (timestamp) {
    let dateObj = new Date(timestamp);
    let hours = dateObj.getHours();
    hours = (hours < 10 ? '0' : '') + hours;
    let mins = dateObj.getMinutes();
    mins = (mins < 10 ? '0' : '') + mins;
    if (watchingAnime) {
        nextEventInfo.textContent = 'Stop Anime at ' + hours + ':' + mins;
    }
    else {
        nextEventInfo.textContent = 'Next Episode at ' + hours + ':' + mins;
    }

}

function startClicked() {
    window.onbeforeunload = function (e) {
        return "Sure you want to leave?";
    };

    checkPerms();
    startCountdown(timeMins, 0);
    updateEventDetails(endTime);
    startButton.textContent = "RESTART";
}

function pauseCountdown() {
    paused = true;
    pause.style.visibility = 'hidden';
    play.style.visibility = 'visible';
}

function resumeCountdown() {
    paused = false;
    pause.style.visibility = 'visible';
    play.style.visibility = 'hidden';
}

//startCountdown(1, 5);
//add5mins();
//updateEventDetails(endTime)

/*NOTIFICATIONS*/

const checkPerms = function () {
    if (Notification.permission === "granted") {
        //alert("we have permission");
        console.log("notifications allowed");
    } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then(permission => {
            console.log(permission);
        });
    }
}

const notify = function (heading, desc) {
    checkPerms();

    const notification = new Notification(heading, {
        body: desc,
        icon: "../Images/icon.png"
    });
    beep.play();
}

checkPerms();