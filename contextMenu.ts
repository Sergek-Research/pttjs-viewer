import PTTJSPlugin from "main";

const menuEvents = ['click', 'dblclick'];

export class Menu {
  element: HTMLElement;
  items: MenuItem[] = [];
  boundCloseByDocumentClick: (event: MouseEvent) => void;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'pttjs-context-menu';
    this.element.style.position = 'fixed';
    this.element.style.backgroundColor = 'var(--background-primary)';
    this.element.style.border = '1px solid var(--background-modifier-border)';
    this.element.style.borderRadius = '4px';
    this.element.style.padding = '4px 0';
    this.element.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
    this.element.style.zIndex = '1000';
    document.body.appendChild(this.element);

    this.boundCloseByDocumentClick = (event: MouseEvent) => {
      if (!this.element.contains(event.target as Node)) {
        this.close();
      }
    };

    menuEvents.forEach(event => {
      document.addEventListener(event, this.boundCloseByDocumentClick, true);
    });
  }
  
  addItem(callback: (item: MenuItem) => void): Menu {
    const item = new MenuItem(this);
    this.items.push(item);
    this.element.appendChild(item.element);
    callback(item);
    return this;
  }
  
  showAtPosition(position: { x: number, y: number }): void {
    this.element.style.left = position.x + 'px';
    this.element.style.top = position.y + 'px';
    this.element.style.display = 'block';
  }
  
  close(): void {
    if (this.element.parentElement) {
      this.element.parentElement.removeChild(this.element);
    }
    menuEvents.forEach(event => {
      document.removeEventListener(event, this.boundCloseByDocumentClick, true);
    });
  }
}

export class MenuItem {
  element: HTMLElement;
  menu: Menu;
  
  constructor(menu: Menu) {
    this.menu = menu;
    this.element = document.createElement('div');
    this.element.className = 'pttjs-menu-item';
    this.element.style.padding = '6px 12px';
    this.element.style.cursor = 'pointer';
    this.element.addEventListener('mouseenter', () => {
      this.element.style.backgroundColor = 'var(--background-modifier-hover)';
    });
    this.element.addEventListener('mouseleave', () => {
      this.element.style.backgroundColor = '';
    });
  }
  
  setTitle(title: string): MenuItem {
    this.element.textContent = title;
    return this;
  }
  
  onClick(callback: () => void): MenuItem {
    this.element.addEventListener('click', (e) => {
      e.stopPropagation();
      callback();
      this.menu.close();
    });
    return this;
  }
}