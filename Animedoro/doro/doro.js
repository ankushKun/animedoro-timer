var interval;
let endTime = Date.now() + (40 * 60 * 1000);
let watchingAnime = false;
let animeTime = 20;
let workTime = 40;
let timeMins = workTime;

const minsCounter = document.querySelector('.minutes');
const secsCounter = document.querySelector('.seconds');
const startButton = document.querySelector('#start-button');
const plus5 = document.querySelector('#plus5');
const nextEventInfo = document.querySelector('.next-event-info')

const beep = document.querySelector("#notificationSound");

startButton.textContent = "START";
plus5.textContent = "+5";
plus5.style.visibility = 'hidden';


const startCountdown = function (mins, secs) {
    const now = Date.now();
    endTime = now + (mins * 60 * 1000) + (secs * 1000);
    displayTime(Math.round((endTime - Date.now()) / 1000));
    plus5.style.visibility = 'visible';
    interval = setInterval(() => {
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
                return;
            }
        }
        displayTime(timeLeft);
    }, 100);
}

const displayTime = function (seconds) {
    let minutesRemaining = Math.floor(seconds / 60);
    let secondsRemaining = seconds % 60;
    minsCounter.textContent = (minutesRemaining < 10 ? '0' : '') + minutesRemaining;
    secsCounter.textContent = (secondsRemaining < 10 ? '0' : '') + secondsRemaining;
    console.log(minutesRemaining, secondsRemaining);
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

startButton.addEventListener('click', startClicked);
plus5.addEventListener('click', add5mins);

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