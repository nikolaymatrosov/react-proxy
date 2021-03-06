import assign from 'lodash/object/assign';
import difference from 'lodash/array/difference';

export default function createPrototypeProxy() {
  let proxy = {};
  let current = null;
  let mountedInstances = [];

  /**
   * Creates a proxied method that calls the current version, whenever available.
   */
  function proxyMethod(name) {
    // Wrap to always call the current version
    const proxiedMethod = function () {
      if (typeof current[name] === 'function') {
        return current[name].apply(this, arguments);
      }
    };

    // Copy properties of the original function, if any
    assign(proxiedMethod, current[name]);
    return proxiedMethod;
  }

  /**
   * Augments the original componentWillMount with instance tracking.
   * We're using it instead of componentDidMount because it works with shallow rendering.
   * TODO: maybe this is a bad idea and we should instead fix shallow rendering.
   */
  function proxiedComponentWillMount() {
    mountedInstances.push(this);
    if (typeof current.componentWillMount === 'function') {
      return current.componentWillMount.apply(this, arguments);
    }
  }

  /**
   * Augments the original componentWillUnmount with instance tracking.
   */
  function proxiedComponentWillUnmount() {
    mountedInstances.splice(mountedInstances.indexOf(this), 1);
    if (typeof current.componentWillUnmount === 'function') {
      return current.componentWillUnmount.apply(this, arguments);
    }
  }

  /**
   * Defines a property on the proxy.
   */
  function defineProxyProperty(name, descriptor) {
    Object.defineProperty(proxy, name, descriptor);
  }

  /**
   * Defines a property, attempting to keep the original descriptor configuration.
   */
  function defineProxyPropertyWithValue(name, value) {
    const {
      enumerable = false,
      writable = true
    } = Object.getOwnPropertyDescriptor(current, name) || {};

    defineProxyProperty(name, {
      configurable: true,
      enumerable,
      writable,
      value
    });
  }

  /**
   * Applies the updated prototype.
   */
  function update(next) {
    // Save current source of truth
    current = next;

    // Find changed property names
    const currentNames = Object.getOwnPropertyNames(current);
    const previousName = Object.getOwnPropertyNames(proxy);
    const addedNames = difference(currentNames, previousName);
    const removedNames = difference(previousName, currentNames);

    // Remove properties and methods that are no longer there
    removedNames.forEach(name => {
      delete proxy[name];
    });

    // Copy every descriptor
    currentNames.forEach(name => {
      const descriptor = Object.getOwnPropertyDescriptor(current, name);
      if (typeof descriptor.value === 'function') {
        // Functions require additional wrapping so they can be bound later
        defineProxyPropertyWithValue(name, proxyMethod(name));
      } else {
        // Other values can be copied directly
        defineProxyProperty(name, descriptor);
      }
    });

    // Track mounting and unmounting
    defineProxyPropertyWithValue('componentWillMount', proxiedComponentWillMount);
    defineProxyPropertyWithValue('componentWillUnmount', proxiedComponentWillUnmount);

    // Reset the cached autobinding map
    defineProxyPropertyWithValue('__reactAutoBindMap', {});

    // Set up the prototype chain
    proxy.__proto__ = next;
  }

  /**
   * Returns the up-to-date proxy prototype.
   */
  function get() {
    return proxy;
  }

  /**
   * Returns an array of all mounted instances.
   */
  function getMountedInstances() {
    return mountedInstances;
  }

  return {
    update,
    get,
    getMountedInstances
  };
};